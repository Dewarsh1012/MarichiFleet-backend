import {
  UserModel,
  VehicleModel,
  DriverModel,
  TripModel,
  BookingModel,
  InvoiceModel,
  ApprovalModel,
  CustomerModel,
  VendorModel,
  FuelEntryModel,
  GeofenceModel,
  JobCardModel,
  ComplianceItemModel,
} from '../models/index.js';
import { initialSeedData } from './seedData.js';
import { logger } from '../../platform/logger.js';

export async function seedMongoDatabase() {
  try {
    const userCount = await UserModel.countDocuments();
    if (userCount === 0) {
      logger.info('🌱 Empty MongoDB detected. Pre-populating with transport seed dataset...');

      // 1. Users
      await UserModel.insertMany(
        initialSeedData.users.map((u) => ({
          userId: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          tenantId: u.tenantId,
          branches: u.branches,
          permissions: ['*'],
          authProvider: 'local',
        }))
      );

      // 2. Vehicles
      await VehicleModel.insertMany(
        initialSeedData.vehicles.map((v) => ({
          id: v.id,
          tenantId: v.tenantId,
          regNumber: v.regNumber,
          model: v.model,
          capacityTons: v.capacityTons,
          type: v.type,
          status: v.status,
          fuelLevelPercent: v.fuelLevelPercent,
          batteryVolts: v.batteryVolts,
          odometerKm: v.odometerKm,
          assignedDriverId: v.assignedDriverId,
          currentTripId: v.currentTripId,
          currentLocation: v.currentLocation,
          documents: v.documents,
        }))
      );

      // 3. Drivers
      await DriverModel.insertMany(
        initialSeedData.drivers.map((d) => ({
          id: d.id,
          tenantId: d.tenantId,
          name: d.name,
          phone: d.phone,
          licenseNumber: d.licenseNumber,
          licenseValidUntil: d.licenseValidUntil,
          status: d.status,
          currentTripId: d.currentTripId,
          rating: d.rating,
          totalTripsCompleted: d.totalTripsCompleted,
          aadhaarLast4: d.aadhaarLast4,
          settlementPendingAmount: d.settlementPendingAmount,
        }))
      );

      // 4. Trips
      await TripModel.insertMany(
        initialSeedData.trips.map((t) => ({
          id: t.id,
          tenantId: t.tenantId,
          bookingId: t.bookingId,
          clientName: t.clientName,
          origin: t.origin,
          destination: t.destination,
          vehicleRegNumber: t.vehicleRegNumber,
          driverId: t.driverId,
          driverName: t.driverName,
          driverPhone: t.driverPhone,
          cargoDescription: t.cargoDescription,
          weightTons: t.weightTons,
          totalDistanceKm: t.totalDistanceKm,
          completedDistanceKm: t.completedDistanceKm,
          status: t.status,
          slaStatus: t.slaStatus,
          eta: t.eta ? new Date(t.eta) : undefined,
          dispatchedAt: t.dispatchedAt ? new Date(t.dispatchedAt) : undefined,
          freightAmount: t.freightAmount,
          advancePaid: t.advancePaid,
          detentionAccrued: t.detentionAccrued,
          checkpoints: t.checkpoints?.map((c: any) => ({
            name: c.name,
            timestamp: c.timestamp ? new Date(c.timestamp) : undefined,
            status: c.status,
          })),
          ewayBillNumber: t.ewayBillNumber,
          ewayBillValidUntil: t.ewayBillValidUntil ? new Date(t.ewayBillValidUntil) : undefined,
        }))
      );

      // 5. Bookings
      await BookingModel.insertMany(
        initialSeedData.bookings.map((b) => ({
          id: b.id,
          tenantId: b.tenantId,
          clientName: b.clientName,
          pickupLocation: b.pickupLocation,
          deliveryLocation: b.deliveryLocation,
          expectedWeightTons: b.expectedWeightTons,
          vehicleTypeRequired: b.vehicleTypeRequired,
          quotedRate: b.quotedRate,
          status: b.status,
        }))
      );

      // 6. Invoices
      await InvoiceModel.insertMany(
        initialSeedData.invoices.map((inv) => ({
          id: inv.id,
          tenantId: inv.tenantId,
          tripId: inv.tripId,
          clientName: inv.clientName,
          clientGstin: inv.clientGstin,
          sacCode: inv.sacCode,
          freightAmount: inv.freightAmount,
          detentionAmount: inv.detentionAmount,
          taxableAmount: inv.taxableAmount,
          cgstAmount: inv.cgstAmount,
          sgstAmount: inv.sgstAmount,
          igstAmount: inv.igstAmount,
          totalAmount: inv.totalAmount,
          status: inv.status,
          irn: inv.irn,
          qrCodeData: inv.qrCodeData,
          issuedDate: new Date(inv.issuedDate),
          dueDate: new Date(inv.dueDate),
          paidAt: inv.paidAt ? new Date(inv.paidAt) : undefined,
          dsoDays: inv.dsoDays,
        }))
      );

      // 7. Approvals
      await ApprovalModel.insertMany(
        initialSeedData.approvals.map((appr) => ({
          id: appr.id,
          tenantId: appr.tenantId,
          department: appr.department || 'FINANCE',
          category: appr.category || 'GENERAL',
          title: appr.title,
          requestedBy: appr.requestedBy,
          driverPhone: appr.driverPhone,
          vehicleRegNumber: appr.vehicleRegNumber,
          tripId: appr.tripId,
          amount: appr.amount,
          fuelDetails: appr.fuelDetails,
          reason: appr.reason,
          status: appr.status,
        }))
      );

      logger.info('✅ Successfully seeded core MongoDB with initial fleet, trips, invoices, and users.');
    }

    // Seed Customers if empty
    if (await CustomerModel.countDocuments() === 0) {
      await CustomerModel.insertMany([
        { id: 'cust_01', tenantId: 'tenant_delhi_01', name: 'Tata Steel Processing Ltd', contactPerson: 'Vikram Singhania', phone: '+91 98201 11223', email: 'dispatch@tatasteel.com', gstin: '07AAACT2727Q1ZW', billingAddress: 'Plot 42, Okhla Phase III', city: 'New Delhi', state: 'Delhi', pincode: '110020', creditLimitAmount: 2500000, outstandingAmount: 485000, paymentTermDays: 30, status: 'ACTIVE', totalTrips: 142 },
        { id: 'cust_02', tenantId: 'tenant_delhi_01', name: 'Reliance Retail Logistics', contactPerson: 'Sunil Mehta', phone: '+91 98112 33445', email: 'transport.hub@ril.com', gstin: '27AABCR4567A1Z1', billingAddress: 'Ghansoli Hub, MIDC', city: 'Navi Mumbai', state: 'Maharashtra', pincode: '400701', creditLimitAmount: 5000000, outstandingAmount: 1240000, paymentTermDays: 45, status: 'ACTIVE', totalTrips: 310 },
        { id: 'cust_03', tenantId: 'tenant_delhi_01', name: 'Jindal Saw & Pipes', contactPerson: 'Amitabh Roy', phone: '+91 98300 55667', email: 'logistics@jindal.com', gstin: '06AAACJ1234F1Z8', billingAddress: 'Sector 25, IMT Manesar', city: 'Gurugram', state: 'Haryana', pincode: '122050', creditLimitAmount: 1500000, outstandingAmount: 0, paymentTermDays: 15, status: 'ACTIVE', totalTrips: 68 },
      ]);
      logger.info('✅ Seeded Customers');
    }

    // Seed Vendors if empty
    if (await VendorModel.countDocuments() === 0) {
      await VendorModel.insertMany([
        { id: 'vnd_01', tenantId: 'tenant_delhi_01', name: 'Shree Karni Transport Brokers', contactPerson: 'Mahendra Bhati', phone: '+91 98290 88776', email: 'karni.trans@gmail.com', gstin: '08AABFS1234D1Z2', address: 'Transport Nagar', city: 'Jaipur', state: 'Rajasthan', type: 'BROKER', vehiclesAttached: 12, pendingPayments: 185000, status: 'ACTIVE' },
        { id: 'vnd_02', tenantId: 'tenant_delhi_01', name: 'Haryana Express Roadlines', contactPerson: 'Devender Hooda', phone: '+91 94160 33221', email: 'haryana.express@rediffmail.com', gstin: '06AABCH9988E1Z5', address: 'GT Road', city: 'Panipat', state: 'Haryana', type: 'ATTACHED_VEHICLE', vehiclesAttached: 6, pendingPayments: 92000, status: 'ACTIVE' },
        { id: 'vnd_03', tenantId: 'tenant_delhi_01', name: 'HPCL Highway Petroleum NH-48', contactPerson: 'Rameshwar Dayal', phone: '+91 98291 44556', email: 'hpcl.kotputli@hpcl.co.in', gstin: '08AAACH2233K1Z9', address: 'NH-48 Km 142', city: 'Kotputli', state: 'Rajasthan', type: 'FUEL_STATION', vehiclesAttached: 0, pendingPayments: 345000, status: 'ACTIVE' },
      ]);
      logger.info('✅ Seeded Vendors');
    }

    // Seed Fuel Entries if empty
    if (await FuelEntryModel.countDocuments() === 0) {
      await FuelEntryModel.insertMany([
        { id: 'fuel_01', tenantId: 'tenant_delhi_01', vehicleRegNumber: 'DL01AA1001', driverPhone: '+91 98110 23456', pumpName: 'HPCL Highway Oasis, Kotputli', slipNumber: 'HP-849201', volumeLitres: 165.5, ratePerLitre: 89.65, totalAmount: 14837, odometerKm: 145220, receiptUrl: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800', status: 'APPROVED', approvalId: 'appr_fuel_101', createdAt: new Date(Date.now() - 3600000 * 24) },
        { id: 'fuel_02', tenantId: 'tenant_delhi_01', vehicleRegNumber: 'MH04BC2002', driverPhone: '+91 98200 67890', pumpName: 'IndianOil COCO Plaza, Vadodara', slipNumber: 'IOC-391840', volumeLitres: 210.0, ratePerLitre: 90.20, totalAmount: 18942, odometerKm: 210800, receiptUrl: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800', status: 'APPROVED', createdAt: new Date(Date.now() - 3600000 * 48) },
      ]);
      logger.info('✅ Seeded Fuel Entries');
    }

    // Seed Geofences if empty
    if (await GeofenceModel.countDocuments() === 0) {
      await GeofenceModel.insertMany([
        { id: 'geo_01', tenantId: 'tenant_delhi_01', name: 'Delhi Okhla Loading Terminal', type: 'CIRCLE', center: { lat: 28.5355, lng: 77.2732 }, radiusKm: 1.5, category: 'LOADING_POINT', isActive: true, alertOnEntry: true, alertOnExit: true },
        { id: 'geo_02', tenantId: 'tenant_delhi_01', name: 'Bhiwandi Central Logistics Park', type: 'CIRCLE', center: { lat: 19.2813, lng: 73.0483 }, radiusKm: 3.0, category: 'UNLOADING_POINT', isActive: true, alertOnEntry: true, alertOnExit: true },
        { id: 'geo_03', tenantId: 'tenant_delhi_01', name: 'Kishangarh Toll Plaza NH-48', type: 'CIRCLE', center: { lat: 26.5744, lng: 74.8643 }, radiusKm: 0.8, category: 'TOLL_PLAZA', isActive: true, alertOnEntry: true, alertOnExit: true },
      ]);
      logger.info('✅ Seeded Geofences');
    }

    // Seed Workshop Job Cards if empty
    if (await JobCardModel.countDocuments() === 0) {
      await JobCardModel.insertMany([
        { id: 'jc_01', tenantId: 'tenant_delhi_01', vehicleRegNumber: 'HR55C7007', type: 'PREVENTIVE', title: '50,000 Km Major Service', description: 'Engine oil flush, diesel filter change, brake shoe lining inspection', assignedMechanic: 'Sohan Lal', priority: 'MEDIUM', status: 'IN_PROGRESS', estimatedCost: 18500, actualCost: 12000, startedAt: new Date(Date.now() - 3600000 * 6) },
        { id: 'jc_02', tenantId: 'tenant_delhi_01', vehicleRegNumber: 'DL01AA1001', type: 'INSPECTION', title: 'Pre-Monsoon Tire Retread & Alignment', description: 'Front dual steer axle alignment and rear retread testing', assignedMechanic: 'Pawan Kumar', priority: 'LOW', status: 'COMPLETED', estimatedCost: 7500, actualCost: 7200, startedAt: new Date(Date.now() - 3600000 * 72), completedAt: new Date(Date.now() - 3600000 * 48) },
      ]);
      logger.info('✅ Seeded Job Cards');
    }

    // Seed Compliance Items if empty
    if (await ComplianceItemModel.countDocuments() === 0) {
      await ComplianceItemModel.insertMany([
        { id: 'cmp_01', tenantId: 'tenant_delhi_01', entityType: 'VEHICLE', entityId: 'DL01AA1001', entityLabel: 'DL01AA1001 (Tata Prima)', itemType: 'National Goods Permit', description: 'All India Tourist & Goods Permit renew via Parivahan', dueDate: new Date(Date.now() + 3600000 * 24 * 18), status: 'EXPIRING_SOON', lastChecked: new Date() },
        { id: 'cmp_02', tenantId: 'tenant_delhi_01', entityType: 'VEHICLE', entityId: 'MH04BC2002', entityLabel: 'MH04BC2002 (BharatBenz)', itemType: 'Insurance (Comprehensive Commercial)', description: 'New India Assurance Policy No. 312019482', dueDate: new Date(Date.now() + 3600000 * 24 * 120), status: 'COMPLIANT', lastChecked: new Date() },
        { id: 'cmp_03', tenantId: 'tenant_delhi_01', entityType: 'DRIVER', entityId: 'drv_01', entityLabel: 'Ramesh Singh', itemType: 'Heavy Commercial Driving License', description: 'Commercial HMV badge verification on Sarathi portal', dueDate: new Date(Date.now() + 3600000 * 24 * 340), status: 'COMPLIANT', lastChecked: new Date() },
      ]);
      logger.info('✅ Seeded Compliance Items');
    }

  } catch (error) {
    logger.error({ err: error, msg: 'Error seeding MongoDB collections' });
  }
}
