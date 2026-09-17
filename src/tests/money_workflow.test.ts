import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  ConsignmentModel,
  InvoiceModel,
  PaymentModel,
} from '../db/models/index.js';
import { transitionConsignmentStatus } from '../modules/consignments/consignments.service.js';
import { canonicalConsignmentStatus, canonicalTripStatus } from '../modules/consignments/status.js';
import { moneySnapshotSchema } from '../modules/trip-wallet/money.js';
import { calculateSettlementTotals } from '../modules/settlements/settlements.service.js';

const actor = {
  userId: 'test-user',
  email: 'test@example.com',
  name: 'Test User',
  role: 'ADMIN',
};

async function run() {
  const mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  await mongoose.connect(mongo.getUri());
  try {
    assert.equal(canonicalConsignmentStatus('completed'), 'DELIVERED');
    assert.equal(canonicalTripStatus('closed'), 'COMPLETED');

    const money = moneySnapshotSchema.parse({
      minorUnits: 10_000,
      currency: 'usd',
      baseMinorUnits: 830_000,
      baseCurrency: 'inr',
      rate: 83,
      source: 'RBI_REFERENCE',
      asOf: '2026-09-17T00:00:00.000Z',
    });
    assert.equal(money.currency, 'USD');
    assert.throws(() => moneySnapshotSchema.parse({ ...money, baseMinorUnits: 1 }));

    await ConsignmentModel.create({
      id: 'cgn-test',
      consignmentNo: 'CON-2026-000001',
      lrNo: 'LR-2026-000001',
      consignorId: 'sender',
      consigneeId: 'receiver',
      tenantId: 'tenant-a',
      branchId: 'br-1',
      shipmentDate: '2026-09-17',
      expectedDeliveryDate: '2026-09-18',
      commodity: 'Parts',
      origin: 'Delhi',
      destination: 'Mumbai',
      freightAmount: 100,
      totalAmount: 100,
      currentStatus: 'DRAFT',
    });
    await assert.rejects(() => transitionConsignmentStatus({
      consignmentId: 'cgn-test',
      tenantId: 'tenant-b',
      nextStatus: 'BOOKED',
      actor,
    }), /not found/);
    const transitioned = await transitionConsignmentStatus({
      consignmentId: 'cgn-test',
      tenantId: 'tenant-a',
      nextStatus: 'BOOKED',
      actor,
    });
    assert.equal(transitioned?.currentStatus, 'BOOKED');

    const totals = calculateSettlementTotals([
      { direction: 'CREDIT', money },
      { direction: 'DEBIT', money: { ...money, minorUnits: 2_000, baseMinorUnits: 166_000 } },
    ]);
    assert.deepEqual(totals, {
      creditsMinorUnits: 830_000,
      debitsMinorUnits: 166_000,
      netMinorUnits: 664_000,
      netDirection: 'PAYABLE',
    });

    const invoice = await InvoiceModel.create({
      id: 'INV-TEST',
      tenantId: 'tenant-a',
      clientName: 'Client',
      clientGstin: '07ABCDE1234F1Z5',
      sacCode: '996511',
      freightAmount: 100,
      detentionAmount: 0,
      taxableAmount: 100,
      cgstAmount: 2.5,
      sgstAmount: 2.5,
      igstAmount: 0,
      totalAmount: 105,
      paidMinorUnits: 0,
      status: 'FINALISED',
      issuedDate: new Date(),
      dsoDays: 0,
    });
    invoice.totalAmount = 999;
    await assert.rejects(() => invoice.save(), /immutable/);

    const paymentData = {
      id: 'pay-1',
      tenantId: 'tenant-a',
      invoiceId: 'INV-TEST',
      amount: 50,
      money: { ...money, minorUnits: 5_000, baseMinorUnits: 415_000 },
      idempotencyKey: 'same-key',
      mode: 'UPI',
      paidBy: 'Client',
      status: 'MATCHED',
      receivedAt: new Date(),
      createdAt: new Date(),
    };
    await PaymentModel.init();
    await PaymentModel.create(paymentData);
    await assert.rejects(() => PaymentModel.create({ ...paymentData, id: 'pay-2' }));
    console.log('Canonical money workflow tests passed');
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
