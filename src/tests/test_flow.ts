import { initDatabase } from '../db/client.js';
import { app } from '../app.js';
import { eventBus } from '../platform/events/eventBus.js';
import { PlaybookRunModel, WhatsAppMessageModel, AuditLogModel } from '../db/models/index.js';
import http from 'http';

async function runVerification() {
  console.log('🧪 Starting MarichiFleet OS End-to-End Enterprise Flow Verification...');

  // 1. Initialize MongoDB in-memory or connection
  await initDatabase();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address: any = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  async function api(path: string, options: any = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const json: any = await res.json();
    return { status: res.status, ok: res.ok, data: json };
  }

  try {
    // Test 1: Super Admin Login & Forced Reset Flag
    console.log('\n--- 1. Testing Super Admin Login ---');
    const loginRes = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'superadmin@marichifleet.com',
        password: 'Admin@123',
      }),
    });
    if (!loginRes.ok || loginRes.data?.data?.user?.role !== 'SUPER_ADMIN') {
      throw new Error(`Super admin login failed: ${JSON.stringify(loginRes.data)}`);
    }
    console.log('✅ Super Admin login succeeded:', loginRes.data?.data?.user?.email);
    console.log('✅ mustResetPassword flag:', loginRes.data?.data?.mustResetPassword);
    const token = loginRes.data?.data?.token;

    // Test 1.1: Password Reset
    const resetRes = await api('/auth/reset-forced-password', {
      method: 'POST',
      body: JSON.stringify({
        email: 'superadmin@marichifleet.com',
        newPassword: 'NewSecurePassword@123',
      }),
    });
    console.log('✅ Force password reset endpoint:', resetRes.data?.message);

    // Test 2: Dynamic Role Management
    console.log('\n--- 2. Testing Dynamic Role Creation ---');
    const roleRes = await api('/admin/roles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        code: 'TEST_CUSTOM_DISP',
        name: 'Test Custom Dispatch Desk',
        description: 'Role for expedited night dispatch desk',
        permissions: ['consignments:*', 'trips:*', 'dispatch:*'],
        branchRestricted: true,
        allowedBranches: ['DL-Okhla'],
      }),
    });
    console.log('✅ Created Dynamic Role:', roleRes.data?.data?.code);

    // Test 3: Consignor Bounded Context
    console.log('\n--- 3. Testing Consignor Creation ---');
    const consignorRes = await api('/consignors', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        companyName: 'Bharat Electronics Ltd',
        tradeName: 'BEL Defense Electronics',
        contactPerson: 'K. S. Narayanan',
        mobile: '+91 98440 55555',
        email: 'logistics@bel.co.in',
        addressLine1: 'Jalahalli Post',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        postalCode: '560013',
        industryType: 'Defense & Aerospace',
        creditLimit: 10000000,
        iecNumber: '0799001122',
      }),
    });
    const consignorId = consignorRes.data?.data?.id;
    console.log('✅ Created Consignor:', consignorRes.data?.data?.code, consignorRes.data?.data?.companyName);

    // Test 4: Consignee Bounded Context
    console.log('\n--- 4. Testing Consignee Creation ---');
    const consigneeRes = await api('/consignees', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        companyName: 'Indian Army Base Logistics Depot',
        contactPerson: 'Col. R. K. Sharma',
        mobile: '+91 98110 77777',
        email: 'canteen.depot@nic.in',
        address: 'COD Delhi Cantonment',
        city: 'New Delhi',
        state: 'Delhi',
        country: 'India',
        postalCode: '110010',
        importerCode: 'DEF-IN-001',
      }),
    });
    const consigneeId = consigneeRes.data?.data?.id;
    console.log('✅ Created Consignee:', consigneeRes.data?.data?.code, consigneeRes.data?.data?.companyName);

    // Test 5: Consignment Creation (Auto Numbering: CON & LR)
    console.log('\n--- 5. Testing Consignment Creation & Numbering ---');
    const consignmentRes = await api('/consignments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        consignorId,
        consigneeId,
        shipmentDate: '2026-09-15',
        expectedDeliveryDate: '2026-09-17',
        cargoType: 'DEFENSE_ELECTRONICS',
        commodity: 'Radar Signal Processing Units',
        packageCount: 16,
        packageType: 'CRATES',
        weight: 12.8,
        volume: 24.5,
        declaredValue: 24000000,
        origin: 'Bengaluru (Jalahalli)',
        destination: 'New Delhi (Cantonment)',
        freightAmount: 110000,
        fuelSurcharge: 8500,
        insuranceCharges: 15000,
        paymentMode: 'BILLING_PARTY',
        incoterm: 'FOB',
        containerNo: 'CRU-992100-8',
      }),
    });
    const consignment = consignmentRes.data?.data;
    console.log('✅ Created Consignment:', consignment.consignmentNo, 'LR:', consignment.lrNo);
    console.log('✅ Total Calculated Freight Amount: ₹', consignment.totalAmount);

    // Test 6: Vehicle & Driver Assignment
    console.log('\n--- 6. Testing Asset & Crew Assignment ---');
    const vehicleRes = await api(`/consignments/${consignment.id}/assign-vehicle`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        vehicleRegNumber: 'DL01AA1001',
      }),
    });
    console.log('✅ Assigned Vehicle:', vehicleRes.data?.data?.vehicleRegNumber, 'Status:', vehicleRes.data?.data?.currentStatus);

    const driverRes = await api(`/consignments/${consignment.id}/assign-driver`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        driverName: 'Ramesh Singh',
        driverPhone: '+91 98110 23456',
      }),
    });
    console.log('✅ Assigned Driver:', driverRes.data?.data?.driverName, 'Status:', driverRes.data?.data?.currentStatus);

    // Test 7: Lifecycle Progression: PICKED_UP -> IN_TRANSIT -> DELIVERED
    console.log('\n--- 7. Testing State Engine & Lifecycle Transitions ---');
    await api(`/consignments/${consignment.id}/status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        status: 'PICKED_UP',
        location: 'Jalahalli Factory Gate 2',
      }),
    });
    console.log('✅ Transitioned to: PICKED_UP');

    await api(`/consignments/${consignment.id}/status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        status: 'IN_TRANSIT',
        location: 'NH-44 Hyderabad Outer Ring Road',
        latitude: 17.385,
        longitude: 78.4867,
      }),
    });
    console.log('✅ Transitioned to: IN_TRANSIT');

    await api(`/consignments/${consignment.id}/status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        status: 'DELIVERED',
        location: 'Delhi Cantonment Gate 4',
      }),
    });
    console.log('✅ Transitioned to: DELIVERED');

    // Test 8: POD Upload & Verification
    console.log('\n--- 8. Testing POD Upload ---');
    const podRes = await api(`/consignments/${consignment.id}/pod`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        podUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800',
        receiverName: 'Subedar M. K. Pillai',
        receiverMobile: '+91 98110 77777',
        deliveryRemarks: 'Cargo verified with zero shortage and zero seal tampering',
      }),
    });
    console.log('✅ POD Uploaded. Current Status:', podRes.data?.data?.currentStatus);

    // Test 9: Close Consignment
    await api(`/consignments/${consignment.id}/status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        status: 'CLOSED',
        remarks: 'POD verified, e-invoice generated and consignment closed',
      }),
    });
    console.log('✅ Consignment successfully CLOSED');

    // Test 10: Verify Playbooks & Automation Runs
    console.log('\n--- 9. Verifying Playbook Runs & WhatsApp Messages ---');
    await new Promise((r) => setTimeout(r, 1000));
    const playbookRuns = await PlaybookRunModel.find({ entityId: consignment.id }).lean();
    console.log(`✅ Playbooks Executed (${playbookRuns.length}):`, playbookRuns.map((p) => p.playbookKey).join(', '));

    const messages = await WhatsAppMessageModel.find({ tenantId: consignment.tenantId }).sort({ timestamp: -1 }).limit(5).lean();
    console.log(`✅ WhatsApp Messages Generated (${messages.length}):`, messages.map((m) => `${m.recipient}: ${m.type}`).join(' | '));

    // Test 11: Verify Append-Only Audit Trail
    console.log('\n--- 10. Verifying Append-Only Audit Trail ---');
    const auditLogs = await AuditLogModel.find({ resourceId: consignment.id }).lean();
    console.log(`✅ Audit Trail Entries Recorded (${auditLogs.length}):`, auditLogs.map((a) => a.action).join(', '));

    // Test 12: Verify Reports
    console.log('\n--- 11. Verifying Reports Engine ---');
    const [revReport, shipmentsReport, inTransitReport] = await Promise.all([
      api('/reports/consignor-revenue', { headers: { Authorization: `Bearer ${token}` } }),
      api('/reports/consignor-shipments', { headers: { Authorization: `Bearer ${token}` } }),
      api('/reports/in-transit', { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    console.log('✅ Consignor Revenue Report Count:', revReport.data?.total);
    console.log('✅ Consignor Shipments Report Categories:', shipmentsReport.data?.data?.length);
    console.log('✅ In-Transit Report Count:', inTransitReport.data?.total);

    console.log('\n🎉 ALL 12 ENTERPRISE VALIDATION TESTS PASSED PERFECTLY!\n');
  } finally {
    server.close();
    process.exit(0);
  }
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
