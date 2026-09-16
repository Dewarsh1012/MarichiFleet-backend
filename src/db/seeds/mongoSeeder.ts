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
  RoleModel,
  ConsignorModel,
  ConsigneeModel,
  ConsignmentModel,
  ConsignmentStatusHistoryModel,
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

    // Seed Super Admin if missing
    const superAdmin = await UserModel.findOne({ email: 'superadmin@marichifleet.com' });
    if (!superAdmin) {
      await UserModel.create({
        userId: 'usr_superadmin',
        username: 'superadmin',
        email: 'superadmin@marichifleet.com',
        name: 'Super Administrator',
        role: 'SUPER_ADMIN',
        tenantId: '*',
        orgId: 'org_marichi_global',
        branches: ['ALL'],
        permissions: ['*'],
        passwordHash: 'Admin@123',
        mustResetPassword: true,
        authProvider: 'local',
        status: 'ACTIVE',
      });
      logger.info('✅ Seeded Super Admin user (superadmin / superadmin@marichifleet.com / Admin@123)');
    }

    // Seed Roles if empty
    if ((await RoleModel.countDocuments()) === 0) {
      await RoleModel.insertMany([
        { id: 'r_superadmin', code: 'SUPER_ADMIN', name: 'Super Administrator', description: 'Complete system, multi-tenant & configuration access', tenantId: '*', permissions: ['*'], isSystem: true, branchRestricted: false },
        { id: 'r_admin', code: 'ADMIN', name: 'Tenant Administrator', description: 'Tenant configuration, branch management, master registers', tenantId: '*', permissions: ['admin:*', 'users:*', 'branches:*', 'roles:*'], isSystem: true, branchRestricted: false },
        { id: 'r_bm', code: 'BRANCH_MANAGER', name: 'Branch Manager', description: 'Branch-level operations, dispatch approvals, local finances', tenantId: '*', permissions: ['consignments:*', 'dispatch:*', 'trips:*'], isSystem: true, branchRestricted: true },
        { id: 'r_ops', code: 'OPERATIONS_MANAGER', name: 'Operations Manager', description: 'Regional dispatch, asset allocation, control tower oversight', tenantId: '*', permissions: ['consignments:*', 'bookings:*', 'trips:*', 'tower:*'], isSystem: true, branchRestricted: false },
        { id: 'r_bko', code: 'BOOKING_OPERATOR', name: 'Booking Operator', description: 'Freight quotation, customer order intake, consignment drafting', tenantId: '*', permissions: ['bookings:*', 'consignors:*', 'consignees:*', 'consignments:create'], isSystem: true, branchRestricted: false },
        { id: 'r_disp', code: 'DISPATCHER', name: 'Dispatcher', description: 'Vehicle & driver assignment, dispatch planning, trip creation', tenantId: '*', permissions: ['dispatch:*', 'consignments:assign_asset', 'trips:create'], isSystem: true, branchRestricted: false },
        { id: 'r_trk', code: 'TRACKING_EXECUTIVE', name: 'Tracking Executive', description: 'Live location monitoring, delay alarms, checkpoint confirmation', tenantId: '*', permissions: ['tower:*', 'consignments:read', 'trips:read'], isSystem: true, branchRestricted: false },
        { id: 'r_fin', code: 'FINANCE_EXECUTIVE', name: 'Finance Executive', description: 'E-invoicing, receivables, settlement validation, ledger entry', tenantId: '*', permissions: ['invoices:*', 'ledger:*', 'expenses:*', 'finance:*'], isSystem: true, branchRestricted: false },
        { id: 'r_cs', code: 'CUSTOMER_SUPPORT', name: 'Customer Support', description: 'Shipper tracking support, delay communications, claim assistance', tenantId: '*', permissions: ['consignments:read', 'customers:read', 'comms:*'], isSystem: true, branchRestricted: false },
        { id: 'r_drv', code: 'DRIVER', name: 'Driver', description: 'Mobile duty execution, live WhatsApp check-in, digital POD upload', tenantId: '*', permissions: ['trips:read', 'pod:upload'], isSystem: true, branchRestricted: false },
        { id: 'r_csgu', code: 'CONSIGNOR_USER', name: 'Consignor Portal User', description: 'External shipper portal for booking, live shipment track & invoices', tenantId: '*', permissions: ['portals:consignor', 'consignments:read'], isSystem: true, branchRestricted: false },
        { id: 'r_cneu', code: 'CONSIGNEE_USER', name: 'Consignee Portal User', description: 'External receiver portal for shipment arrival track & POD download', tenantId: '*', permissions: ['portals:consignee', 'consignments:read'], isSystem: true, branchRestricted: false },
        { id: 'r_cust', code: 'CUSTOMER_USER', name: 'Customer User', description: 'Freight client self-service portal', tenantId: '*', permissions: ['portals:customer'], isSystem: true, branchRestricted: false },
        { id: 'r_aud', code: 'AUDITOR', name: 'Compliance Auditor', description: 'Read-only access to immutable audit trails, ledger and GST/e-invoices', tenantId: '*', permissions: ['audit:*', 'reports:*', 'ledger:read'], isSystem: true, branchRestricted: false },
      ]);
      logger.info('✅ Seeded 14 Dynamic Roles');
    }

    // Seed Consignors if empty
    if ((await ConsignorModel.countDocuments()) === 0) {
      await ConsignorModel.insertMany([
        {
          id: 'csg_01',
          code: 'CSG-0001',
          tenantId: 'tenant_delhi_01',
          branchId: 'br_01',
          companyName: 'Tata AutoComp Systems Ltd',
          tradeName: 'TACO Logistics',
          contactPerson: 'Arun Kulkarni',
          mobile: '+91 98220 12345',
          email: 'logistics@taco.com',
          gstNumber: '27AAACT1234F1Z1',
          panNumber: 'AAACT1234F',
          addressLine1: 'Plot A-1, Phase II, MIDC Chakan',
          city: 'Pune',
          state: 'Maharashtra',
          country: 'India',
          postalCode: '410501',
          industryType: 'Automotive Components',
          customerCategory: 'KEY_ACCOUNT',
          creditLimit: 2500000,
          paymentTerms: 'NET_30',
          status: 'ACTIVE',
          iecNumber: '0308012345',
          eoriNumber: 'GB123456789000',
          vatNumber: 'GB999999973',
          exportLicenseNumber: 'EXP-IN-2026-88',
          countryOfOrigin: 'India',
        },
        {
          id: 'csg_02',
          code: 'CSG-0002',
          tenantId: 'tenant_delhi_01',
          branchId: 'br_01',
          companyName: 'Sun Pharma Industries Ltd',
          tradeName: 'Sun Pharma Exports',
          contactPerson: 'Dr. Alok Verma',
          mobile: '+91 98110 54321',
          email: 'supplychain@sunpharma.com',
          gstNumber: '07AAACS5678K1Z5',
          panNumber: 'AAACS5678K',
          addressLine1: 'Industrial Area Phase 1',
          city: 'New Delhi',
          state: 'Delhi',
          country: 'India',
          postalCode: '110020',
          industryType: 'Pharmaceuticals',
          customerCategory: 'ENTERPRISE',
          creditLimit: 5000000,
          paymentTerms: 'NET_15',
          status: 'ACTIVE',
          iecNumber: '0512098765',
          countryOfOrigin: 'India',
        },
      ]);
      logger.info('✅ Seeded Consignors');
    }

    // Seed Consignees if empty
    if ((await ConsigneeModel.countDocuments()) === 0) {
      await ConsigneeModel.insertMany([
        {
          id: 'cne_01',
          code: 'CNE-0001',
          tenantId: 'tenant_delhi_01',
          branchId: 'br_01',
          companyName: 'Apex Motor Parts Private Limited',
          contactPerson: 'Mahesh Solanki',
          mobile: '+91 98200 98765',
          email: 'receiving@apexautoparts.in',
          gstVatNumber: '24AABCA9999P1Z3',
          address: 'GIDC Industrial Estate, Makarpura',
          city: 'Vadodara',
          state: 'Gujarat',
          country: 'India',
          postalCode: '390010',
          status: 'ACTIVE',
          importerCode: 'IMP-GJ-449',
          customsRegistrationNumber: 'CRN-2026-091',
        },
        {
          id: 'cne_02',
          code: 'CNE-0002',
          tenantId: 'tenant_delhi_01',
          branchId: 'br_01',
          companyName: 'Metro Healthcare Distribution Hub',
          contactPerson: 'Sanjay Nair',
          mobile: '+91 98450 11223',
          email: 'warehouse@metrohealth.com',
          gstVatNumber: '29AABCM1122D1Z9',
          address: 'Peenya 3rd Phase, Outer Ring Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          country: 'India',
          postalCode: '560058',
          status: 'ACTIVE',
        },
      ]);
      logger.info('✅ Seeded Consignees');
    }

    // Seed Consignments if empty
    if ((await ConsignmentModel.countDocuments()) === 0) {
      await ConsignmentModel.insertMany([
        {
          id: 'cgn_01',
          consignmentNo: 'CON-2026-000001',
          lrNo: 'LR-2026-000001',
          bookingId: 'BKG-101',
          consignorId: 'csg_01',
          consigneeId: 'cne_01',
          tenantId: 'tenant_delhi_01',
          branchId: 'br_01',
          shipmentDate: '2026-09-14',
          expectedDeliveryDate: '2026-09-16',
          cargoType: 'AUTOMOTIVE_PARTS',
          commodity: 'Engine Gearboxes & Transmissions',
          description: '12 Pallets of precision automotive transmissions',
          packageCount: 12,
          packageType: 'PALLETS',
          weight: 18.5,
          volume: 32.0,
          declaredValue: 4500000,
          routeId: 'rt_del_mum',
          vehicleId: 'v_01',
          vehicleRegNumber: 'DL01AA1001',
          driverId: 'drv_01',
          driverName: 'Ramesh Singh',
          driverPhone: '+91 98110 23456',
          origin: 'Pune (MIDC Chakan)',
          destination: 'Vadodara (Makarpura)',
          freightAmount: 65000,
          loadingCharges: 2500,
          unloadingCharges: 2500,
          fuelSurcharge: 4500,
          insuranceCharges: 1200,
          detentionCharges: 0,
          otherCharges: 800,
          totalAmount: 76500,
          paymentMode: 'BILLING_PARTY',
          paymentStatus: 'PAID',
          currentStatus: 'IN_TRANSIT',
          currentLocation: {
            latitude: 21.1702,
            longitude: 72.8311,
            address: 'Surat Bypass NH-48',
            speedKmH: 52,
            updatedAt: new Date(),
          },
          lastUpdate: new Date(),
          eta: '2026-09-16 14:00',
          incoterm: 'FOB',
          containerNo: 'MSKU-829104-2',
          containerType: '40FT_HQ',
        },
        {
          id: 'cgn_02',
          consignmentNo: 'CON-2026-000002',
          lrNo: 'LR-2026-000002',
          bookingId: 'BKG-102',
          consignorId: 'csg_02',
          consigneeId: 'cne_02',
          tenantId: 'tenant_delhi_01',
          branchId: 'br_01',
          shipmentDate: '2026-09-15',
          expectedDeliveryDate: '2026-09-18',
          cargoType: 'TEMPERATURE_CONTROLLED',
          commodity: 'Pharmaceutical Cold Chain Vaccines',
          description: 'Refrigerated vaccines (2-8 deg C)',
          packageCount: 450,
          packageType: 'CORRUGATED_BOXES',
          weight: 6.2,
          volume: 14.5,
          declaredValue: 8500000,
          vehicleId: 'v_02',
          vehicleRegNumber: 'MH04BC2002',
          driverId: 'drv_02',
          driverName: 'Gurpreet Singh',
          driverPhone: '+91 98200 67890',
          origin: 'New Delhi (Okhla)',
          destination: 'Bengaluru (Peenya)',
          freightAmount: 95000,
          loadingCharges: 3000,
          unloadingCharges: 3000,
          fuelSurcharge: 6200,
          insuranceCharges: 4800,
          detentionCharges: 0,
          otherCharges: 1500,
          totalAmount: 113500,
          paymentMode: 'PREPAID',
          paymentStatus: 'PAID',
          currentStatus: 'VEHICLE_ASSIGNED',
          currentLocation: {
            latitude: 28.5355,
            longitude: 77.2732,
            address: 'Delhi Okhla Loading Bay',
            speedKmH: 0,
            updatedAt: new Date(),
          },
          lastUpdate: new Date(),
          eta: '2026-09-18 10:00',
        },
      ]);
      logger.info('✅ Seeded Consignments');
    }

  } catch (error) {
    logger.error({ err: error, msg: 'Error seeding MongoDB collections' });
  }
}

