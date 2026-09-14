import mongoose, { Schema } from 'mongoose';

// --- USER MODEL (Google Auth & Role) ---
export interface IUser {
  userId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  googleId?: string;
  authProvider: 'google' | 'local' | 'demo';
  role: string;
  tenantId: string;
  orgId: string;
  branches: string[];
  permissions: string[];
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  userId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true },
  avatarUrl: { type: String },
  googleId: { type: String, sparse: true },
  authProvider: { type: String, enum: ['google', 'local', 'demo'], default: 'local' },
  role: { type: String, default: 'FLEET_OWNER' },
  tenantId: { type: String, required: true, default: 'tenant_delhi_01' },
  orgId: { type: String, default: 'org_marichi_logistics' },
  branches: { type: [String], default: ['DL-Okhla', 'MH-Bhiwandi'] },
  permissions: { type: [String], default: ['*'] },
  createdAt: { type: Date, default: Date.now },
});

export const UserModel = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

// --- TENANT MODEL ---
export interface ITenant {
  id: string;
  name: string;
  gstin: string;
  pan: string;
  stateCode: string;
  registeredAddress: string;
  branches: Array<{ code: string; name: string; gstin: string }>;
  createdAt: Date;
}

const TenantSchema = new Schema<ITenant>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  gstin: { type: String },
  pan: { type: String },
  stateCode: { type: String },
  registeredAddress: { type: String },
  branches: [{ code: String, name: String, gstin: String }],
  createdAt: { type: Date, default: Date.now },
});

export const TenantModel = mongoose.models.Tenant || mongoose.model<ITenant>('Tenant', TenantSchema);

// --- VEHICLE MODEL ---
export interface IVehicle {
  id: string;
  tenantId: string;
  regNumber: string;
  model: string;
  capacityTons: number;
  type: string;
  status: string;
  fuelLevelPercent: number;
  batteryVolts: number;
  odometerKm: number;
  assignedDriverId?: string;
  currentTripId?: string;
  currentLocation?: {
    latitude: number;
    longitude: number;
    address: string;
    speedKmH: number;
    bearing: number;
    updatedAt: Date;
  };
  documents?: {
    rcValidUntil?: string;
    fitnessValidUntil?: string;
    insuranceValidUntil?: string;
    pucValidUntil?: string;
  };
  createdAt: Date;
}

const VehicleSchema = new Schema<IVehicle>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  regNumber: { type: String, required: true },
  model: { type: String, required: true },
  capacityTons: { type: Number, required: true },
  type: { type: String, default: 'CONTAINER_CLOSED' },
  status: { type: String, default: 'AVAILABLE' },
  fuelLevelPercent: { type: Number, default: 85 },
  batteryVolts: { type: Number, default: 24.5 },
  odometerKm: { type: Number, default: 0 },
  assignedDriverId: { type: String },
  currentTripId: { type: String },
  currentLocation: {
    latitude: Number,
    longitude: Number,
    address: String,
    speedKmH: Number,
    bearing: Number,
    updatedAt: { type: Date, default: Date.now },
  },
  documents: {
    rcValidUntil: String,
    fitnessValidUntil: String,
    insuranceValidUntil: String,
    pucValidUntil: String,
  },
  createdAt: { type: Date, default: Date.now },
});

export const VehicleModel = mongoose.models.Vehicle || mongoose.model<IVehicle>('Vehicle', VehicleSchema);

// --- DRIVER MODEL ---
export interface IDriver {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  licenseNumber: string;
  licenseValidUntil: string;
  status: string;
  currentTripId?: string;
  rating: number;
  totalTripsCompleted: number;
  aadhaarLast4?: string;
  settlementPendingAmount: number;
  createdAt: Date;
}

const DriverSchema = new Schema<IDriver>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  licenseNumber: { type: String, required: true },
  licenseValidUntil: { type: String, required: true },
  status: { type: String, default: 'AVAILABLE' },
  currentTripId: { type: String },
  rating: { type: Number, default: 5.0 },
  totalTripsCompleted: { type: Number, default: 0 },
  aadhaarLast4: { type: String, default: '0000' },
  settlementPendingAmount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export const DriverModel = mongoose.models.Driver || mongoose.model<IDriver>('Driver', DriverSchema);

// --- TRIP MODEL ---
export interface ITrip {
  id: string;
  tenantId: string;
  bookingId?: string;
  clientName: string;
  origin: string;
  destination: string;
  vehicleRegNumber: string;
  driverId?: string;
  driverName: string;
  driverPhone: string;
  cargoDescription?: string;
  weightTons: number;
  totalDistanceKm: number;
  completedDistanceKm: number;
  status: string;
  slaStatus: string;
  eta?: Date;
  dispatchedAt?: Date;
  freightAmount: number;
  advancePaid: number;
  detentionAccrued: number;
  checkpoints?: Array<{ name: string; timestamp?: Date; status: string }>;
  pod?: {
    signedByName: string;
    podPhotoUrl?: string;
    submittedAt?: Date;
    isCleanPOD?: boolean;
    shortageUnits?: number;
    damageUnits?: number;
  };
  ewayBillNumber?: string;
  ewayBillValidUntil?: Date;
  createdAt: Date;
}

const TripSchema = new Schema<ITrip>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  bookingId: { type: String },
  clientName: { type: String, required: true },
  origin: { type: String, required: true },
  destination: { type: String, required: true },
  vehicleRegNumber: { type: String, required: true },
  driverId: { type: String },
  driverName: { type: String, required: true },
  driverPhone: { type: String, required: true },
  cargoDescription: { type: String, default: 'General Cargo' },
  weightTons: { type: Number, required: true },
  totalDistanceKm: { type: Number, required: true },
  completedDistanceKm: { type: Number, default: 0 },
  status: { type: String, default: 'DISPATCHED' },
  slaStatus: { type: String, default: 'ON_TIME' },
  eta: { type: Date },
  dispatchedAt: { type: Date },
  freightAmount: { type: Number, required: true },
  advancePaid: { type: Number, default: 0 },
  detentionAccrued: { type: Number, default: 0 },
  checkpoints: [{ name: String, timestamp: Date, status: { type: String, default: 'PENDING' } }],
  pod: {
    signedByName: String,
    podPhotoUrl: String,
    submittedAt: Date,
    isCleanPOD: { type: Boolean, default: true },
    shortageUnits: { type: Number, default: 0 },
    damageUnits: { type: Number, default: 0 },
  },
  ewayBillNumber: { type: String },
  ewayBillValidUntil: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

export const TripModel = mongoose.models.Trip || mongoose.model<ITrip>('Trip', TripSchema);

// --- BOOKING MODEL ---
export interface IBooking {
  id: string;
  tenantId: string;
  clientName: string;
  pickupLocation: string;
  deliveryLocation: string;
  expectedWeightTons: number;
  vehicleTypeRequired: string;
  quotedRate: number;
  status: string;
  createdAt: Date;
}

const BookingSchema = new Schema<IBooking>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  clientName: { type: String, required: true },
  pickupLocation: { type: String, required: true },
  deliveryLocation: { type: String, required: true },
  expectedWeightTons: { type: Number, required: true },
  vehicleTypeRequired: { type: String, default: 'CONTAINER_CLOSED' },
  quotedRate: { type: Number, required: true },
  status: { type: String, default: 'CONFIRMED' },
  createdAt: { type: Date, default: Date.now },
});

export const BookingModel = mongoose.models.Booking || mongoose.model<IBooking>('Booking', BookingSchema);

// --- INVOICE MODEL ---
export interface IInvoice {
  id: string;
  tenantId: string;
  tripId?: string;
  clientName: string;
  clientGstin: string;
  sacCode: string;
  freightAmount: number;
  detentionAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  status: string;
  irn?: string;
  qrCodeData?: string;
  issuedDate: Date;
  dueDate?: Date;
  paidAt?: Date;
  finalisedAt?: Date;
  dsoDays: number;
}

const InvoiceSchema = new Schema<IInvoice>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  tripId: { type: String },
  clientName: { type: String, required: true },
  clientGstin: { type: String, required: true },
  sacCode: { type: String, default: '996511' },
  freightAmount: { type: Number, required: true },
  detentionAmount: { type: Number, default: 0 },
  taxableAmount: { type: Number, required: true },
  cgstAmount: { type: Number, default: 0 },
  sgstAmount: { type: Number, default: 0 },
  igstAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  status: { type: String, default: 'DRAFT' },
  irn: { type: String },
  qrCodeData: { type: String },
  issuedDate: { type: Date, default: Date.now },
  dueDate: { type: Date },
  paidAt: { type: Date },
  finalisedAt: { type: Date },
  dsoDays: { type: Number, default: 0 },
});

export const InvoiceModel = mongoose.models.Invoice || mongoose.model<IInvoice>('Invoice', InvoiceSchema);

// --- APPROVAL MODEL ---
export interface IApproval {
  id: string;
  tenantId: string;
  department: 'FINANCE' | 'OPERATIONS';
  category: string;
  title: string;
  requestedBy: string;
  driverPhone?: string;
  vehicleRegNumber?: string;
  tripId?: string;
  amount: number;
  fuelDetails?: {
    pumpName: string;
    volumeLitres: number;
    ratePerLitre: number;
    totalAmount: number;
    slipNumber: string;
    odometerKm?: number;
    calculatedMileage?: string;
    receiptUrl?: string;
    geoCheckPassed?: boolean;
  };
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedBy?: string;
  decisionComment?: string;
  decidedAt?: Date;
  createdAt: Date;
}

const ApprovalSchema = new Schema<IApproval>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  department: { type: String, enum: ['FINANCE', 'OPERATIONS'], required: true },
  category: { type: String, required: true },
  title: { type: String, required: true },
  requestedBy: { type: String, required: true },
  driverPhone: { type: String },
  vehicleRegNumber: { type: String },
  tripId: { type: String },
  amount: { type: Number, required: true },
  fuelDetails: {
    pumpName: String,
    volumeLitres: Number,
    ratePerLitre: Number,
    totalAmount: Number,
    slipNumber: String,
    odometerKm: Number,
    calculatedMileage: String,
    receiptUrl: String,
    geoCheckPassed: Boolean,
  },
  reason: { type: String },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  decidedBy: { type: String },
  decisionComment: { type: String },
  decidedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

export const ApprovalModel = mongoose.models.Approval || mongoose.model<IApproval>('Approval', ApprovalSchema);

// --- CUSTOMER / CLIENT MODEL ---
export interface ICustomer {
  id: string;
  tenantId: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  gstin: string;
  pan?: string;
  billingAddress: string;
  city: string;
  state: string;
  pincode: string;
  creditLimitAmount: number;
  outstandingAmount: number;
  paymentTermDays: number;
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  totalTrips: number;
  createdAt: Date;
}

const CustomerSchema = new Schema<ICustomer>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  contactPerson: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  gstin: { type: String, default: '' },
  pan: { type: String },
  billingAddress: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  pincode: { type: String, default: '' },
  creditLimitAmount: { type: Number, default: 500000 },
  outstandingAmount: { type: Number, default: 0 },
  paymentTermDays: { type: Number, default: 30 },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'BLOCKED'], default: 'ACTIVE' },
  totalTrips: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export const CustomerModel = mongoose.models.Customer || mongoose.model<ICustomer>('Customer', CustomerSchema);

// --- VENDOR MODEL ---
export interface IVendor {
  id: string;
  tenantId: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  gstin: string;
  pan?: string;
  address: string;
  city: string;
  state: string;
  type: 'BROKER' | 'ATTACHED_VEHICLE' | 'SERVICE_PROVIDER' | 'FUEL_STATION';
  vehiclesAttached: number;
  pendingPayments: number;
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  createdAt: Date;
}

const VendorSchema = new Schema<IVendor>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  contactPerson: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  gstin: { type: String, default: '' },
  pan: { type: String },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  type: { type: String, enum: ['BROKER', 'ATTACHED_VEHICLE', 'SERVICE_PROVIDER', 'FUEL_STATION'], default: 'BROKER' },
  vehiclesAttached: { type: Number, default: 0 },
  pendingPayments: { type: Number, default: 0 },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'BLOCKED'], default: 'ACTIVE' },
  createdAt: { type: Date, default: Date.now },
});

export const VendorModel = mongoose.models.Vendor || mongoose.model<IVendor>('Vendor', VendorSchema);

// --- LEDGER ENTRY MODEL (Append-only — Law 5) ---
export interface ILedgerEntry {
  id: string;
  tenantId: string;
  referenceId: string;
  referenceType: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  narration: string;
  transactionDate: Date;
}

const LedgerEntrySchema = new Schema<ILedgerEntry>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  referenceId: { type: String, required: true },
  referenceType: { type: String, required: true },
  debitAccount: { type: String, required: true },
  creditAccount: { type: String, required: true },
  amount: { type: Number, required: true },
  narration: { type: String, default: '' },
  transactionDate: { type: Date, default: Date.now },
});

export const LedgerEntryModel = mongoose.models.LedgerEntry || mongoose.model<ILedgerEntry>('LedgerEntry', LedgerEntrySchema);

// --- FUEL ENTRY MODEL ---
export interface IFuelEntry {
  id: string;
  tenantId: string;
  vehicleRegNumber: string;
  driverPhone: string;
  tripId?: string;
  pumpName: string;
  volumeLitres: number;
  ratePerLitre: number;
  totalAmount: number;
  slipNumber: string;
  fuelType: string;
  odometerKm?: number;
  calculatedMileage?: string;
  receiptUrl?: string;
  geoCheckPassed: boolean;
  approvalId?: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  createdAt: Date;
}

const FuelEntrySchema = new Schema<IFuelEntry>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  vehicleRegNumber: { type: String, required: true },
  driverPhone: { type: String, default: '' },
  tripId: { type: String },
  pumpName: { type: String, required: true },
  volumeLitres: { type: Number, required: true },
  ratePerLitre: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  slipNumber: { type: String, default: '' },
  fuelType: { type: String, default: 'DIESEL (HSD BS-VI)' },
  odometerKm: { type: Number },
  calculatedMileage: { type: String },
  receiptUrl: { type: String },
  geoCheckPassed: { type: Boolean, default: true },
  approvalId: { type: String },
  status: { type: String, enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED'], default: 'PENDING_APPROVAL' },
  createdAt: { type: Date, default: Date.now },
});

export const FuelEntryModel = mongoose.models.FuelEntry || mongoose.model<IFuelEntry>('FuelEntry', FuelEntrySchema);

// --- WHATSAPP MESSAGE MODEL ---
export interface IWhatsAppMessage {
  id: string;
  tenantId: string;
  sender: string;
  senderPhone?: string;
  senderName?: string;
  recipient: string;
  content: string;
  type?: string;
  mediaUrl?: string;
  timestamp: Date;
}

const WhatsAppMessageSchema = new Schema<IWhatsAppMessage>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  sender: { type: String, required: true },
  senderPhone: { type: String },
  senderName: { type: String },
  recipient: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String },
  mediaUrl: { type: String },
  timestamp: { type: Date, default: Date.now },
});

export const WhatsAppMessageModel = mongoose.models.WhatsAppMessage || mongoose.model<IWhatsAppMessage>('WhatsAppMessage', WhatsAppMessageSchema);

// --- EXCEPTION MODEL (Control Tower) ---
export interface IException {
  id: string;
  tenantId: string;
  vehicleRegNumber?: string;
  tripId?: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  resolvedAt?: Date;
  resolutionNote?: string;
  timestamp: Date;
}

const ExceptionSchema = new Schema<IException>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  vehicleRegNumber: { type: String },
  tripId: { type: String },
  type: { type: String, required: true },
  severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
  description: { type: String, required: true },
  status: { type: String, enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'], default: 'OPEN' },
  resolvedAt: { type: Date },
  resolutionNote: { type: String },
  timestamp: { type: Date, default: Date.now },
});

export const ExceptionModel = mongoose.models.Exception || mongoose.model<IException>('Exception', ExceptionSchema);

// --- DOCUMENT MODEL (Document Vault) ---
export interface IDocument {
  id: string;
  tenantId: string;
  entityType: 'VEHICLE' | 'DRIVER' | 'TRIP' | 'COMPANY';
  entityId: string;
  docType: string;
  fileName: string;
  fileUrl?: string;
  validFrom?: Date;
  validUntil?: Date;
  status: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'PENDING';
  uploadedBy: string;
  createdAt: Date;
}

const DocumentSchema = new Schema<IDocument>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  entityType: { type: String, enum: ['VEHICLE', 'DRIVER', 'TRIP', 'COMPANY'], required: true },
  entityId: { type: String, required: true },
  docType: { type: String, required: true },
  fileName: { type: String, required: true },
  fileUrl: { type: String },
  validFrom: { type: Date },
  validUntil: { type: Date },
  status: { type: String, enum: ['VALID', 'EXPIRING_SOON', 'EXPIRED', 'PENDING'], default: 'VALID' },
  uploadedBy: { type: String, default: 'system' },
  createdAt: { type: Date, default: Date.now },
});

export const DocumentModel = mongoose.models.Document || mongoose.model<IDocument>('Document', DocumentSchema);

// --- COMPLIANCE ITEM MODEL ---
export interface IComplianceItem {
  id: string;
  tenantId: string;
  entityType: 'VEHICLE' | 'DRIVER' | 'COMPANY';
  entityId: string;
  entityLabel: string;
  itemType: string;
  description: string;
  dueDate?: Date;
  status: 'COMPLIANT' | 'EXPIRING_SOON' | 'NON_COMPLIANT' | 'PENDING';
  lastChecked?: Date;
  createdAt: Date;
}

const ComplianceItemSchema = new Schema<IComplianceItem>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  entityType: { type: String, enum: ['VEHICLE', 'DRIVER', 'COMPANY'], required: true },
  entityId: { type: String, required: true },
  entityLabel: { type: String, default: '' },
  itemType: { type: String, required: true },
  description: { type: String, default: '' },
  dueDate: { type: Date },
  status: { type: String, enum: ['COMPLIANT', 'EXPIRING_SOON', 'NON_COMPLIANT', 'PENDING'], default: 'COMPLIANT' },
  lastChecked: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

export const ComplianceItemModel = mongoose.models.ComplianceItem || mongoose.model<IComplianceItem>('ComplianceItem', ComplianceItemSchema);

// --- EXPENSE MODEL ---
export interface IExpense {
  id: string;
  tenantId: string;
  tripId?: string;
  vehicleRegNumber?: string;
  driverName?: string;
  category: string;
  description: string;
  amount: number;
  receiptUrl?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
  approvedBy?: string;
  paidAt?: Date;
  createdAt: Date;
}

const ExpenseSchema = new Schema<IExpense>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  tripId: { type: String },
  vehicleRegNumber: { type: String },
  driverName: { type: String },
  category: { type: String, required: true },
  description: { type: String, default: '' },
  amount: { type: Number, required: true },
  receiptUrl: { type: String },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'PAID'], default: 'PENDING' },
  approvedBy: { type: String },
  paidAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

export const ExpenseModel = mongoose.models.Expense || mongoose.model<IExpense>('Expense', ExpenseSchema);

// --- INCIDENT MODEL ---
export interface IIncident {
  id: string;
  tenantId: string;
  tripId?: string;
  vehicleRegNumber?: string;
  driverName?: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  location?: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';
  resolvedAt?: Date;
  resolution?: string;
  photos?: string[];
  createdAt: Date;
}

const IncidentSchema = new Schema<IIncident>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  tripId: { type: String },
  vehicleRegNumber: { type: String },
  driverName: { type: String },
  type: { type: String, required: true },
  severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  location: { type: String },
  status: { type: String, enum: ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'], default: 'OPEN' },
  resolvedAt: { type: Date },
  resolution: { type: String },
  photos: { type: [String] },
  createdAt: { type: Date, default: Date.now },
});

export const IncidentModel = mongoose.models.Incident || mongoose.model<IIncident>('Incident', IncidentSchema);

// --- POD (Proof of Delivery) MODEL ---
export interface IPOD {
  id: string;
  tenantId: string;
  tripId: string;
  vehicleRegNumber: string;
  signedByName: string;
  signedByDesignation?: string;
  podPhotoUrl?: string;
  submittedAt: Date;
  isCleanPOD: boolean;
  shortageUnits: number;
  damageUnits: number;
  remarks?: string;
  status: 'SUBMITTED' | 'VERIFIED' | 'DISPUTED' | 'APPROVED';
  verifiedBy?: string;
  createdAt: Date;
}

const PODSchema = new Schema<IPOD>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  tripId: { type: String, required: true },
  vehicleRegNumber: { type: String, required: true },
  signedByName: { type: String, required: true },
  signedByDesignation: { type: String },
  podPhotoUrl: { type: String },
  submittedAt: { type: Date, default: Date.now },
  isCleanPOD: { type: Boolean, default: true },
  shortageUnits: { type: Number, default: 0 },
  damageUnits: { type: Number, default: 0 },
  remarks: { type: String },
  status: { type: String, enum: ['SUBMITTED', 'VERIFIED', 'DISPUTED', 'APPROVED'], default: 'SUBMITTED' },
  verifiedBy: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export const PODModel = mongoose.models.POD || mongoose.model<IPOD>('POD', PODSchema);

// --- JOB CARD MODEL (Workshop) ---
export interface IJobCard {
  id: string;
  tenantId: string;
  vehicleRegNumber: string;
  vehicleId: string;
  type: 'PREVENTIVE' | 'CORRECTIVE' | 'BREAKDOWN' | 'INSPECTION';
  title: string;
  description: string;
  assignedMechanic?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'PARTS_ORDERED' | 'COMPLETED' | 'CANCELLED';
  estimatedCost: number;
  actualCost: number;
  startedAt?: Date;
  completedAt?: Date;
  parts?: Array<{ partName: string; quantity: number; unitCost: number }>;
  createdAt: Date;
}

const JobCardSchema = new Schema<IJobCard>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  vehicleRegNumber: { type: String, required: true },
  vehicleId: { type: String, default: '' },
  type: { type: String, enum: ['PREVENTIVE', 'CORRECTIVE', 'BREAKDOWN', 'INSPECTION'], default: 'CORRECTIVE' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  assignedMechanic: { type: String },
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
  status: { type: String, enum: ['OPEN', 'IN_PROGRESS', 'PARTS_ORDERED', 'COMPLETED', 'CANCELLED'], default: 'OPEN' },
  estimatedCost: { type: Number, default: 0 },
  actualCost: { type: Number, default: 0 },
  startedAt: { type: Date },
  completedAt: { type: Date },
  parts: [{ partName: String, quantity: Number, unitCost: Number }],
  createdAt: { type: Date, default: Date.now },
});

export const JobCardModel = mongoose.models.JobCard || mongoose.model<IJobCard>('JobCard', JobCardSchema);

// --- HR / DUTY LOG MODEL ---
export interface IDutyLog {
  id: string;
  tenantId: string;
  driverId: string;
  driverName: string;
  date: string;
  checkIn?: Date;
  checkOut?: Date;
  hoursWorked: number;
  status: 'ON_DUTY' | 'OFF_DUTY' | 'ON_LEAVE' | 'REST';
  tripId?: string;
  overtimeHours: number;
  notes?: string;
  createdAt: Date;
}

const DutyLogSchema = new Schema<IDutyLog>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  driverId: { type: String, required: true },
  driverName: { type: String, required: true },
  date: { type: String, required: true },
  checkIn: { type: Date },
  checkOut: { type: Date },
  hoursWorked: { type: Number, default: 0 },
  status: { type: String, enum: ['ON_DUTY', 'OFF_DUTY', 'ON_LEAVE', 'REST'], default: 'ON_DUTY' },
  tripId: { type: String },
  overtimeHours: { type: Number, default: 0 },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export const DutyLogModel = mongoose.models.DutyLog || mongoose.model<IDutyLog>('DutyLog', DutyLogSchema);

// --- GEOFENCE MODEL ---
export interface IGeofence {
  id: string;
  tenantId: string;
  name: string;
  type: 'CIRCLE' | 'POLYGON' | 'CORRIDOR';
  center?: { lat: number; lng: number };
  radiusKm?: number;
  polygon?: Array<{ lat: number; lng: number }>;
  category: 'LOADING_POINT' | 'UNLOADING_POINT' | 'FUEL_STATION' | 'REST_STOP' | 'TOLL_PLAZA' | 'CUSTOM';
  isActive: boolean;
  alertOnEntry: boolean;
  alertOnExit: boolean;
  dwellTimeMinutes?: number;
  createdAt: Date;
}

const GeofenceSchema = new Schema<IGeofence>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['CIRCLE', 'POLYGON', 'CORRIDOR'], default: 'CIRCLE' },
  center: { lat: Number, lng: Number },
  radiusKm: { type: Number, default: 1 },
  polygon: [{ lat: Number, lng: Number }],
  category: { type: String, enum: ['LOADING_POINT', 'UNLOADING_POINT', 'FUEL_STATION', 'REST_STOP', 'TOLL_PLAZA', 'CUSTOM'], default: 'CUSTOM' },
  isActive: { type: Boolean, default: true },
  alertOnEntry: { type: Boolean, default: true },
  alertOnExit: { type: Boolean, default: true },
  dwellTimeMinutes: { type: Number },
  createdAt: { type: Date, default: Date.now },
});

export const GeofenceModel = mongoose.models.Geofence || mongoose.model<IGeofence>('Geofence', GeofenceSchema);

// --- PAYMENT MODEL ---
export interface IPayment {
  id: string;
  tenantId: string;
  invoiceId: string;
  amount: number;
  mode: 'BANK_TRANSFER' | 'CHEQUE' | 'CASH' | 'UPI' | 'NEFT' | 'RTGS';
  referenceNumber?: string;
  paidBy: string;
  receivedAt: Date;
  status: 'RECEIVED' | 'MATCHED' | 'DISPUTED';
  createdAt: Date;
}

const PaymentSchema = new Schema<IPayment>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  invoiceId: { type: String, required: true },
  amount: { type: Number, required: true },
  mode: { type: String, enum: ['BANK_TRANSFER', 'CHEQUE', 'CASH', 'UPI', 'NEFT', 'RTGS'], default: 'BANK_TRANSFER' },
  referenceNumber: { type: String },
  paidBy: { type: String, default: '' },
  receivedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['RECEIVED', 'MATCHED', 'DISPUTED'], default: 'RECEIVED' },
  createdAt: { type: Date, default: Date.now },
});

export const PaymentModel = mongoose.models.Payment || mongoose.model<IPayment>('Payment', PaymentSchema);

// --- NOTIFICATION MODEL ---
export interface INotification {
  id: string;
  tenantId: string;
  recipientId: string;
  channel: 'IN_APP' | 'WHATSAPP' | 'SMS' | 'EMAIL';
  title: string;
  body: string;
  link?: string;
  isRead: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  recipientId: { type: String, required: true },
  channel: { type: String, enum: ['IN_APP', 'WHATSAPP', 'SMS', 'EMAIL'], default: 'IN_APP' },
  title: { type: String, required: true },
  body: { type: String, required: true },
  link: { type: String },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export const NotificationModel = mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);

// --- LIVE LOCATION MODEL (Control Tower real-time) ---
export interface ILiveLocation {
  id: string;
  tenantId: string;
  vehicleRegNumber: string;
  driverPhone: string;
  driverName: string;
  latitude: number;
  longitude: number;
  speedKmH: number;
  heading: number;
  isLive: boolean;
  isDropped: boolean;
  source: string;
  lastPing: Date;
  droppedAt?: Date;
}

const LiveLocationSchema = new Schema<ILiveLocation>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  vehicleRegNumber: { type: String, required: true },
  driverPhone: { type: String, default: '' },
  driverName: { type: String, default: '' },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  speedKmH: { type: Number, default: 0 },
  heading: { type: Number, default: 0 },
  isLive: { type: Boolean, default: true },
  isDropped: { type: Boolean, default: false },
  source: { type: String, default: 'WHATSAPP_LIVE_LOCATION' },
  lastPing: { type: Date, default: Date.now },
  droppedAt: { type: Date },
});

export const LiveLocationModel = mongoose.models.LiveLocation || mongoose.model<ILiveLocation>('LiveLocation', LiveLocationSchema);

// --- ROUTE MODEL (Operations Corridor & Pricing) ---
export interface IRoute {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  originCity: string;
  destinationCity: string;
  distanceKm: number;
  estTransitHours: number;
  defaultRate: number;
  tollEstimate: number;
  stops: string[];
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const RouteSchema = new Schema<IRoute>(
  {
    id: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    originCity: { type: String, required: true },
    destinationCity: { type: String, required: true },
    distanceKm: { type: Number, required: true },
    estTransitHours: { type: Number, default: 12 },
    defaultRate: { type: Number, default: 30000 },
    tollEstimate: { type: Number, default: 1500 },
    stops: [{ type: String }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

export const RouteModel = mongoose.models.Route || mongoose.model<IRoute>('Route', RouteSchema);
