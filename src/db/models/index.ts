import mongoose, { Schema } from 'mongoose';

export interface IMoneySnapshot {
  minorUnits: number;
  currency: string;
  baseMinorUnits: number;
  baseCurrency: string;
  rate: number;
  source: string;
  asOf: Date;
}

const MoneySnapshotSchema = new Schema<IMoneySnapshot>(
  {
    minorUnits: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    baseMinorUnits: { type: Number, required: true, min: 0 },
    baseCurrency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    rate: { type: Number, required: true, min: 0 },
    source: { type: String, required: true },
    asOf: { type: Date, required: true },
  },
  { _id: false }
);

// --- USER MODEL (Google Auth & Role) ---
export interface IUser {
  userId: string;
  username?: string;
  email: string;
  passwordHash?: string;
  name: string;
  avatarUrl?: string;
  googleId?: string;
  authProvider: 'google' | 'local' | 'demo';
  role: string;
  tenantId: string;
  orgId: string;
  branches: string[];
  permissions: string[];
  mustResetPassword?: boolean;
  consignorId?: string;
  consigneeId?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  userId: { type: String, required: true, unique: true },
  username: { type: String, sparse: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String },
  name: { type: String, required: true },
  avatarUrl: { type: String },
  googleId: { type: String, sparse: true },
  authProvider: { type: String, enum: ['google', 'local', 'demo'], default: 'local' },
  role: { type: String, default: 'FLEET_OWNER' },
  tenantId: { type: String, required: true, default: 'tenant_delhi_01' },
  orgId: { type: String, default: 'org_marichi_logistics' },
  branches: { type: [String], default: ['DL-Okhla', 'MH-Bhiwandi'] },
  permissions: { type: [String], default: ['*'] },
  mustResetPassword: { type: Boolean, default: false },
  consignorId: { type: String },
  consigneeId: { type: String },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
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
  branches: Array<{ code: string; name: string; gstin: string; address?: string; phone?: string; manager?: string }>;
  modulesEnabled: string[];
  settings?: Record<string, any>;
  status: 'ACTIVE' | 'SUSPENDED' | 'TRIAL';
  createdAt: Date;
}

const TenantSchema = new Schema<ITenant>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  gstin: { type: String },
  pan: { type: String },
  stateCode: { type: String },
  registeredAddress: { type: String },
  branches: [
    {
      code: String,
      name: String,
      gstin: String,
      address: String,
      phone: String,
      manager: String,
    },
  ],
  modulesEnabled: {
    type: [String],
    default: [
      'consignors',
      'consignees',
      'consignments',
      'trips',
      'bookings',
      'fleet',
      'finance',
      'ledger',
      'tower',
      'pod',
      'whatsapp',
      'approvals',
      'reports',
    ],
  },
  settings: { type: Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'TRIAL'], default: 'ACTIVE' },
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
  vendorId?: string;
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
  status: {
    type: String,
    enum: ['PLANNED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED'],
    default: 'DISPATCHED',
  },
  slaStatus: { type: String, default: 'ON_TIME' },
  eta: { type: Date },
  dispatchedAt: { type: Date },
  freightAmount: { type: Number, required: true },
  advancePaid: { type: Number, default: 0 },
  detentionAccrued: { type: Number, default: 0 },
  vendorId: { type: String, index: true },
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
  status: 'DRAFT' | 'FINALISED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
  totalMoney?: IMoneySnapshot;
  paidMinorUnits: number;
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
  status: {
    type: String,
    enum: ['DRAFT', 'FINALISED', 'PARTIALLY_PAID', 'PAID', 'VOID'],
    default: 'DRAFT',
  },
  totalMoney: { type: MoneySnapshotSchema },
  paidMinorUnits: { type: Number, default: 0, min: 0 },
  irn: { type: String },
  qrCodeData: { type: String },
  issuedDate: { type: Date, default: Date.now },
  dueDate: { type: Date },
  paidAt: { type: Date },
  finalisedAt: { type: Date },
  dsoDays: { type: Number, default: 0 },
});

const FINAL_INVOICE_IMMUTABLE_FIELDS = [
  'tripId',
  'clientName',
  'clientGstin',
  'sacCode',
  'freightAmount',
  'detentionAmount',
  'taxableAmount',
  'cgstAmount',
  'sgstAmount',
  'igstAmount',
  'totalAmount',
  'totalMoney',
  'issuedDate',
] as const;

InvoiceSchema.pre('save', async function () {
  if (this.isNew) return;
  const existing: any = await InvoiceModel.findById(this._id).select('status').lean();
  if (existing?.status !== 'DRAFT' && FINAL_INVOICE_IMMUTABLE_FIELDS.some((field) => this.isModified(field))) {
    throw new Error('Finalised invoice financial and identity fields are immutable');
  }
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
  tripId?: string;
  direction?: 'inbound' | 'outbound';
  deliveryStatus?: 'queued' | 'sent' | 'delivered' | 'read' | 'received' | 'failed' | 'deleted' | 'unknown';
  provider?: 'meta' | 'simulated' | 'unconfigured';
  externalId?: string;
  providerError?: unknown;
  retryable?: boolean;
  statusUpdatedAt?: Date;
  providerPayload?: unknown;
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
  tripId: { type: String, index: true },
  direction: { type: String, enum: ['inbound', 'outbound'] },
  deliveryStatus: {
    type: String,
    enum: ['queued', 'sent', 'delivered', 'read', 'received', 'failed', 'deleted', 'unknown'],
  },
  provider: { type: String, enum: ['meta', 'simulated', 'unconfigured'] },
  externalId: { type: String },
  providerError: { type: Schema.Types.Mixed },
  retryable: { type: Boolean, default: false },
  statusUpdatedAt: { type: Date },
  providerPayload: { type: Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now },
});

WhatsAppMessageSchema.index({ externalId: 1 }, { unique: true, sparse: true });
WhatsAppMessageSchema.index({ tenantId: 1, recipient: 1, timestamp: -1 });

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
ComplianceItemSchema.index({ tenantId: 1, status: 1, dueDate: 1 });
ComplianceItemSchema.index({ tenantId: 1, entityType: 1, entityId: 1 });

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
GeofenceSchema.index({ tenantId: 1, isActive: 1, category: 1 });

export const GeofenceModel = mongoose.models.Geofence || mongoose.model<IGeofence>('Geofence', GeofenceSchema);

export interface IGpsPoint {
  id: string;
  tenantId: string;
  tripId: string;
  vehicleRegNumber: string;
  latitude: number;
  longitude: number;
  speedKmH: number;
  heading: number;
  accuracyM?: number;
  source: string;
  idempotencyKey: string;
  recordedAt: Date;
  receivedAt: Date;
}

const GpsPointSchema = new Schema<IGpsPoint>(
  {
    id: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true },
    tripId: { type: String, required: true },
    vehicleRegNumber: { type: String, required: true },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    speedKmH: { type: Number, required: true, min: 0, default: 0 },
    heading: { type: Number, required: true, min: 0, max: 360, default: 0 },
    accuracyM: { type: Number, min: 0 },
    source: { type: String, required: true, default: 'API' },
    idempotencyKey: { type: String, required: true },
    recordedAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false }
);
GpsPointSchema.index({ tenantId: 1, tripId: 1, recordedAt: -1, id: -1 });
GpsPointSchema.index({ tenantId: 1, vehicleRegNumber: 1, recordedAt: -1 });
GpsPointSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });

export const GpsPointModel = mongoose.models.GpsPoint || mongoose.model<IGpsPoint>('GpsPoint', GpsPointSchema);

export interface IGeofenceState {
  tenantId: string;
  tripId: string;
  vehicleRegNumber: string;
  geofenceId: string;
  isInside: boolean;
  lastPointId: string;
  lastRecordedAt: Date;
  updatedAt: Date;
}

const GeofenceStateSchema = new Schema<IGeofenceState>(
  {
    tenantId: { type: String, required: true },
    tripId: { type: String, required: true },
    vehicleRegNumber: { type: String, required: true },
    geofenceId: { type: String, required: true },
    isInside: { type: Boolean, required: true },
    lastPointId: { type: String, required: true },
    lastRecordedAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true }, versionKey: false }
);
GeofenceStateSchema.index(
  { tenantId: 1, tripId: 1, vehicleRegNumber: 1, geofenceId: 1 },
  { unique: true }
);

export const GeofenceStateModel =
  mongoose.models.GeofenceState || mongoose.model<IGeofenceState>('GeofenceState', GeofenceStateSchema);

export interface IGeofenceEvent {
  id: string;
  tenantId: string;
  tripId: string;
  vehicleRegNumber: string;
  geofenceId: string;
  geofenceName: string;
  type: 'ENTER' | 'EXIT';
  pointId: string;
  latitude: number;
  longitude: number;
  occurredAt: Date;
  recordedAt: Date;
}

const GeofenceEventSchema = new Schema<IGeofenceEvent>(
  {
    id: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true },
    tripId: { type: String, required: true },
    vehicleRegNumber: { type: String, required: true },
    geofenceId: { type: String, required: true },
    geofenceName: { type: String, required: true },
    type: { type: String, enum: ['ENTER', 'EXIT'], required: true },
    pointId: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    occurredAt: { type: Date, required: true },
    recordedAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false }
);
GeofenceEventSchema.index({ tenantId: 1, tripId: 1, occurredAt: -1, _id: -1 });
GeofenceEventSchema.index({ tenantId: 1, geofenceId: 1, occurredAt: -1 });
GeofenceEventSchema.index(
  { tenantId: 1, tripId: 1, geofenceId: 1, pointId: 1, type: 1 },
  { unique: true }
);

export const GeofenceEventModel =
  mongoose.models.GeofenceEvent || mongoose.model<IGeofenceEvent>('GeofenceEvent', GeofenceEventSchema);

export interface IPublicTrackingLink {
  id: string;
  tenantId: string;
  tripId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  createdBy: string;
  createdAt: Date;
}

const PublicTrackingLinkSchema = new Schema<IPublicTrackingLink>(
  {
    id: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true },
    tripId: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false }
);
PublicTrackingLinkSchema.index({ tenantId: 1, tripId: 1, createdAt: -1 });
PublicTrackingLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PublicTrackingLinkModel =
  mongoose.models.PublicTrackingLink ||
  mongoose.model<IPublicTrackingLink>('PublicTrackingLink', PublicTrackingLinkSchema);

// --- PAYMENT MODEL ---
export interface IPayment {
  id: string;
  tenantId: string;
  invoiceId: string;
  amount: number;
  money: IMoneySnapshot;
  idempotencyKey: string;
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
  money: { type: MoneySnapshotSchema, required: true },
  idempotencyKey: { type: String, required: true },
  mode: { type: String, enum: ['BANK_TRANSFER', 'CHEQUE', 'CASH', 'UPI', 'NEFT', 'RTGS'], default: 'BANK_TRANSFER' },
  referenceNumber: { type: String },
  paidBy: { type: String, default: '' },
  receivedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['RECEIVED', 'MATCHED', 'DISPUTED'], default: 'RECEIVED' },
  createdAt: { type: Date, default: Date.now },
});

PaymentSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
export const PaymentModel = mongoose.models.Payment || mongoose.model<IPayment>('Payment', PaymentSchema);

export type TripWalletEntryType =
  | 'FREIGHT'
  | 'ADVANCE'
  | 'FUEL'
  | 'TOLL'
  | 'EXPENSE'
  | 'DETENTION'
  | 'RECOVERY';

export interface ITripWalletEntry {
  id: string;
  tenantId: string;
  tripId: string;
  type: TripWalletEntryType;
  direction: 'CREDIT' | 'DEBIT';
  money: IMoneySnapshot;
  partyType?: 'DRIVER' | 'VENDOR' | 'CUSTOMER';
  partyId?: string;
  referenceType?: string;
  referenceId?: string;
  narration: string;
  occurredAt: Date;
  createdBy: string;
  createdAt: Date;
}

const TripWalletEntrySchema = new Schema<ITripWalletEntry>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  tripId: { type: String, required: true, index: true },
  type: {
    type: String,
    enum: ['FREIGHT', 'ADVANCE', 'FUEL', 'TOLL', 'EXPENSE', 'DETENTION', 'RECOVERY'],
    required: true,
  },
  direction: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
  money: { type: MoneySnapshotSchema, required: true },
  partyType: { type: String, enum: ['DRIVER', 'VENDOR', 'CUSTOMER'] },
  partyId: { type: String, index: true },
  referenceType: { type: String },
  referenceId: { type: String },
  narration: { type: String, default: '' },
  occurredAt: { type: Date, default: Date.now },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
TripWalletEntrySchema.index({ tenantId: 1, tripId: 1, occurredAt: 1 });

export const TripWalletEntryModel =
  mongoose.models.TripWalletEntry || mongoose.model<ITripWalletEntry>('TripWalletEntry', TripWalletEntrySchema);

export interface ISettlement {
  id: string;
  tenantId: string;
  tripId: string;
  partyType: 'DRIVER' | 'VENDOR';
  partyId: string;
  status: 'CALCULATED' | 'APPROVED' | 'PAID' | 'DISPUTED';
  creditsMinorUnits: number;
  debitsMinorUnits: number;
  netDirection: 'PAYABLE' | 'RECOVERABLE' | 'SETTLED';
  netMoney: IMoneySnapshot;
  entryIds: string[];
  calculatedAt: Date;
  approvedAt?: Date;
  paidAt?: Date;
  createdBy: string;
  updatedAt: Date;
}

const SettlementSchema = new Schema<ISettlement>(
  {
    id: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true, index: true },
    tripId: { type: String, required: true, index: true },
    partyType: { type: String, enum: ['DRIVER', 'VENDOR'], required: true },
    partyId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['CALCULATED', 'APPROVED', 'PAID', 'DISPUTED'],
      default: 'CALCULATED',
    },
    creditsMinorUnits: { type: Number, required: true, min: 0 },
    debitsMinorUnits: { type: Number, required: true, min: 0 },
    netDirection: { type: String, enum: ['PAYABLE', 'RECOVERABLE', 'SETTLED'], required: true },
    netMoney: { type: MoneySnapshotSchema, required: true },
    entryIds: { type: [String], default: [] },
    calculatedAt: { type: Date, default: Date.now },
    approvedAt: { type: Date },
    paidAt: { type: Date },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);
SettlementSchema.index({ tenantId: 1, tripId: 1, partyType: 1, partyId: 1 }, { unique: true });

export const SettlementModel =
  mongoose.models.Settlement || mongoose.model<ISettlement>('Settlement', SettlementSchema);

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

// ==========================================
// --- 1. DYNAMIC RBAC: ROLE MODEL ---
// ==========================================
export interface IRole {
  id: string;
  code: string;
  name: string;
  description: string;
  tenantId: string; // '*' for system-wide roles, or specific tenantId
  permissions: string[];
  isSystem: boolean;
  branchRestricted: boolean;
  allowedBranches?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    id: { type: String, required: true, unique: true },
    code: { type: String, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    tenantId: { type: String, required: true, default: '*' },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false },
    branchRestricted: { type: Boolean, default: false },
    allowedBranches: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const RoleModel = mongoose.models.Role || mongoose.model<IRole>('Role', RoleSchema);

// ==========================================
// --- 2. APPEND-ONLY AUDIT LOG MODEL ---
// ==========================================
export interface IAuditLog {
  id: string;
  tenantId: string;
  module: string;
  resourceId: string;
  action: string;
  actor: {
    userId: string;
    email: string;
    name: string;
    role: string;
  };
  details: Record<string, any>;
  ipAddress: string;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    id: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true, index: true },
    module: { type: String, required: true, index: true },
    resourceId: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    actor: {
      userId: { type: String, required: true },
      email: { type: String, required: true },
      name: { type: String, required: true },
      role: { type: String, required: true },
    },
    details: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: '127.0.0.1' },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

export const AuditLogModel = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

// ==========================================
// --- 3. CONSIGNOR BOUNDED CONTEXT ---
// ==========================================
export interface IConsignor {
  id: string;
  code: string;
  tenantId: string;
  branchId: string;
  companyName: string;
  tradeName?: string;
  contactPerson: string;
  mobile: string;
  alternateMobile?: string;
  email: string;
  gstNumber?: string;
  panNumber?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  industryType?: string;
  customerCategory?: string;
  creditLimit: number;
  paymentTerms?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  createdBy?: string;
  // International Fields
  iecNumber?: string;
  eoriNumber?: string;
  vatNumber?: string;
  exportLicenseNumber?: string;
  countryOfOrigin?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ConsignorSchema = new Schema<IConsignor>(
  {
    id: { type: String, required: true, unique: true },
    code: { type: String, required: true, index: true },
    tenantId: { type: String, required: true, index: true },
    branchId: { type: String, default: 'br_01', index: true },
    companyName: { type: String, required: true, index: true },
    tradeName: { type: String },
    contactPerson: { type: String, required: true },
    mobile: { type: String, required: true },
    alternateMobile: { type: String },
    email: { type: String, required: true },
    gstNumber: { type: String },
    panNumber: { type: String },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, default: 'India' },
    postalCode: { type: String, required: true },
    industryType: { type: String },
    customerCategory: { type: String, default: 'STANDARD' },
    creditLimit: { type: Number, default: 500000 },
    paymentTerms: { type: String, default: 'NET_30' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'BLOCKED'], default: 'ACTIVE' },
    createdBy: { type: String },
    iecNumber: { type: String },
    eoriNumber: { type: String },
    vatNumber: { type: String },
    exportLicenseNumber: { type: String },
    countryOfOrigin: { type: String },
  },
  { timestamps: true }
);

export const ConsignorModel = mongoose.models.Consignor || mongoose.model<IConsignor>('Consignor', ConsignorSchema);

export interface IConsignorContact {
  id: string;
  consignorId: string;
  tenantId: string;
  name: string;
  designation?: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  createdAt: Date;
}

const ConsignorContactSchema = new Schema<IConsignorContact>(
  {
    id: { type: String, required: true, unique: true },
    consignorId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    designation: { type: String },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const ConsignorContactModel =
  mongoose.models.ConsignorContact || mongoose.model<IConsignorContact>('ConsignorContact', ConsignorContactSchema);

export interface IConsignorDocument {
  id: string;
  consignorId: string;
  tenantId: string;
  title: string;
  type: string;
  fileUrl: string;
  validUntil?: string;
  verified: boolean;
  createdAt: Date;
}

const ConsignorDocumentSchema = new Schema<IConsignorDocument>(
  {
    id: { type: String, required: true, unique: true },
    consignorId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    type: { type: String, required: true },
    fileUrl: { type: String, required: true },
    validUntil: { type: String },
    verified: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ConsignorDocumentModel =
  mongoose.models.ConsignorDocument || mongoose.model<IConsignorDocument>('ConsignorDocument', ConsignorDocumentSchema);

// ==========================================
// --- 4. CONSIGNEE BOUNDED CONTEXT ---
// ==========================================
export interface IConsignee {
  id: string;
  code: string;
  tenantId: string;
  branchId: string;
  companyName: string;
  contactPerson: string;
  mobile: string;
  email: string;
  gstVatNumber?: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  createdBy?: string;
  // International
  importerCode?: string;
  vatNumber?: string;
  eoriNumber?: string;
  customsRegistrationNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ConsigneeSchema = new Schema<IConsignee>(
  {
    id: { type: String, required: true, unique: true },
    code: { type: String, required: true, index: true },
    tenantId: { type: String, required: true, index: true },
    branchId: { type: String, default: 'br_01', index: true },
    companyName: { type: String, required: true, index: true },
    contactPerson: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String, required: true },
    gstVatNumber: { type: String },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, default: 'India' },
    postalCode: { type: String, required: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'BLOCKED'], default: 'ACTIVE' },
    createdBy: { type: String },
    importerCode: { type: String },
    vatNumber: { type: String },
    eoriNumber: { type: String },
    customsRegistrationNumber: { type: String },
  },
  { timestamps: true }
);

export const ConsigneeModel = mongoose.models.Consignee || mongoose.model<IConsignee>('Consignee', ConsigneeSchema);

// ==========================================
// --- 5. CONSIGNMENT BOUNDED CONTEXT ---
// ==========================================
export type ConsignmentStatus =
  | 'DRAFT'
  | 'BOOKED'
  | 'VEHICLE_ASSIGNED'
  | 'DRIVER_ASSIGNED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'AT_HUB'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'POD_RECEIVED'
  | 'CLOSED';

export type PaymentMode = 'PREPAID' | 'TO_PAY' | 'BILLING_PARTY';
export type PaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'OVERDUE';
export type Incoterm = 'FOB' | 'CIF' | 'EXW' | 'DDP' | 'FCA';

export interface IConsignment {
  id: string;
  consignmentNo: string; // CON-YYYY-000001
  lrNo: string; // LR-YYYY-000001
  bookingId?: string;
  consignorId: string;
  consigneeId: string;
  tenantId: string;
  branchId: string;
  shipmentDate: string;
  expectedDeliveryDate: string;

  // Cargo Information
  cargoType: string;
  commodity: string;
  description: string;
  packageCount: number;
  packageType: string;
  weight: number; // tons or kg
  volume: number; // cbm
  declaredValue: number;

  // Transportation
  routeId?: string;
  tripId?: string;
  vehicleId?: string;
  vehicleRegNumber?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  origin: string;
  destination: string;

  // Financial Charges
  freightAmount: number;
  loadingCharges: number;
  unloadingCharges: number;
  fuelSurcharge: number;
  insuranceCharges: number;
  detentionCharges: number;
  otherCharges: number;
  totalAmount: number;

  // Payment
  paymentMode: PaymentMode;
  paymentStatus: PaymentStatus;

  // Live Tracking
  currentStatus: ConsignmentStatus;
  currentLocation?: {
    latitude: number;
    longitude: number;
    address: string;
    speedKmH: number;
    updatedAt: Date;
  };
  lastUpdate?: Date;
  eta?: string;

  // Delivery & POD
  deliveryDate?: string;
  receiverName?: string;
  receiverMobile?: string;
  podUrl?: string;
  deliveryRemarks?: string;

  // International Logistics Support
  hsCode?: string;
  incoterm?: Incoterm;
  countryOfOrigin?: string;
  countryOfDestination?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  containerNo?: string;
  containerType?: string;
  billOfLadingNo?: string;
  airwayBillNo?: string;
  customsStatus?: string;

  createdAt: Date;
  updatedAt: Date;
}

const ConsignmentSchema = new Schema<IConsignment>(
  {
    id: { type: String, required: true, unique: true },
    consignmentNo: { type: String, required: true, unique: true, index: true },
    lrNo: { type: String, required: true, unique: true, index: true },
    bookingId: { type: String, index: true },
    consignorId: { type: String, required: true, index: true },
    consigneeId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true, index: true },
    branchId: { type: String, default: 'br_01', index: true },
    shipmentDate: { type: String, required: true },
    expectedDeliveryDate: { type: String, required: true },

    cargoType: { type: String, default: 'GENERAL_CARGO' },
    commodity: { type: String, required: true },
    description: { type: String, default: '' },
    packageCount: { type: Number, required: true, default: 1 },
    packageType: { type: String, default: 'BOXES' },
    weight: { type: Number, required: true, default: 1 },
    volume: { type: Number, default: 1 },
    declaredValue: { type: Number, default: 100000 },

    routeId: { type: String },
    tripId: { type: String },
    vehicleId: { type: String },
    vehicleRegNumber: { type: String },
    driverId: { type: String },
    driverName: { type: String },
    driverPhone: { type: String },
    origin: { type: String, required: true },
    destination: { type: String, required: true },

    freightAmount: { type: Number, required: true, default: 0 },
    loadingCharges: { type: Number, default: 0 },
    unloadingCharges: { type: Number, default: 0 },
    fuelSurcharge: { type: Number, default: 0 },
    insuranceCharges: { type: Number, default: 0 },
    detentionCharges: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true, default: 0 },

    paymentMode: { type: String, enum: ['PREPAID', 'TO_PAY', 'BILLING_PARTY'], default: 'BILLING_PARTY' },
    paymentStatus: { type: String, enum: ['PENDING', 'PAID', 'PARTIAL', 'OVERDUE'], default: 'PENDING' },

    currentStatus: {
      type: String,
      enum: [
        'DRAFT',
        'BOOKED',
        'VEHICLE_ASSIGNED',
        'DRIVER_ASSIGNED',
        'PICKED_UP',
        'IN_TRANSIT',
        'AT_HUB',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'POD_RECEIVED',
        'CLOSED',
      ],
      default: 'DRAFT',
      index: true,
    },
    currentLocation: {
      latitude: Number,
      longitude: Number,
      address: String,
      speedKmH: Number,
      updatedAt: { type: Date, default: Date.now },
    },
    lastUpdate: { type: Date, default: Date.now },
    eta: { type: String },

    deliveryDate: { type: String },
    receiverName: { type: String },
    receiverMobile: { type: String },
    podUrl: { type: String },
    deliveryRemarks: { type: String },

    hsCode: { type: String },
    incoterm: { type: String, enum: ['FOB', 'CIF', 'EXW', 'DDP', 'FCA'] },
    countryOfOrigin: { type: String },
    countryOfDestination: { type: String },
    portOfLoading: { type: String },
    portOfDischarge: { type: String },
    containerNo: { type: String },
    containerType: { type: String },
    billOfLadingNo: { type: String },
    airwayBillNo: { type: String },
    customsStatus: { type: String },
  },
  { timestamps: true }
);

export const ConsignmentModel =
  mongoose.models.Consignment || mongoose.model<IConsignment>('Consignment', ConsignmentSchema);

export interface IConsignmentItem {
  id: string;
  consignmentId: string;
  tenantId: string;
  description: string;
  packageType: string;
  quantity: number;
  weightKg: number;
  volumeCbm: number;
  declaredValue: number;
}

const ConsignmentItemSchema = new Schema<IConsignmentItem>(
  {
    id: { type: String, required: true, unique: true },
    consignmentId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true, index: true },
    description: { type: String, required: true },
    packageType: { type: String, default: 'BOXES' },
    quantity: { type: Number, default: 1 },
    weightKg: { type: Number, default: 0 },
    volumeCbm: { type: Number, default: 0 },
    declaredValue: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const ConsignmentItemModel =
  mongoose.models.ConsignmentItem || mongoose.model<IConsignmentItem>('ConsignmentItem', ConsignmentItemSchema);

export interface IConsignmentDocument {
  id: string;
  consignmentId: string;
  tenantId: string;
  docType: string;
  docNumber?: string;
  fileUrl: string;
  remarks?: string;
  uploadedAt: Date;
}

const ConsignmentDocumentSchema = new Schema<IConsignmentDocument>(
  {
    id: { type: String, required: true, unique: true },
    consignmentId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true, index: true },
    docType: { type: String, required: true },
    docNumber: { type: String },
    fileUrl: { type: String, required: true },
    remarks: { type: String },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const ConsignmentDocumentModel =
  mongoose.models.ConsignmentDocument || mongoose.model<IConsignmentDocument>('ConsignmentDocument', ConsignmentDocumentSchema);

export interface IConsignmentStatusHistory {
  id: string;
  consignmentId: string;
  tenantId: string;
  fromStatus: string;
  toStatus: string;
  remarks?: string;
  location?: string;
  actor: {
    userId: string;
    name: string;
    role: string;
  };
  timestamp: Date;
}

const ConsignmentStatusHistorySchema = new Schema<IConsignmentStatusHistory>(
  {
    id: { type: String, required: true, unique: true },
    consignmentId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true, index: true },
    fromStatus: { type: String, required: true },
    toStatus: { type: String, required: true },
    remarks: { type: String },
    location: { type: String },
    actor: {
      userId: { type: String, required: true },
      name: { type: String, required: true },
      role: { type: String, required: true },
    },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

export const ConsignmentStatusHistoryModel =
  mongoose.models.ConsignmentStatusHistory ||
  mongoose.model<IConsignmentStatusHistory>('ConsignmentStatusHistory', ConsignmentStatusHistorySchema);

// ==========================================
// --- 6. PLAYBOOK AUTOMATION RUN MODEL ---
// ==========================================
export interface IPlaybookRun {
  id: string;
  tenantId: string;
  playbookKey: string;
  version: number;
  triggerEvent: string;
  entityId: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  actionsTaken: string[];
  executedAt: Date;
}

const PlaybookRunSchema = new Schema<IPlaybookRun>(
  {
    id: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true, index: true },
    playbookKey: { type: String, required: true, index: true },
    version: { type: Number, default: 1 },
    triggerEvent: { type: String, required: true },
    entityId: { type: String, required: true, index: true },
    status: { type: String, enum: ['SUCCESS', 'FAILED', 'SKIPPED'], default: 'SUCCESS' },
    actionsTaken: { type: [String], default: [] },
    executedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const PlaybookRunModel =
  mongoose.models.PlaybookRun || mongoose.model<IPlaybookRun>('PlaybookRun', PlaybookRunSchema);

// --- FX RATE MODEL ---
export interface IFxRate {
  base: string;
  rates: Record<string, number>;
  source: string;
  updatedAt: Date;
}

const FxRateSchema = new Schema<IFxRate>({
  base: { type: String, required: true, default: 'INR' },
  rates: { type: Schema.Types.Mixed, required: true },
  source: { type: String, default: 'default' },
  updatedAt: { type: Date, default: Date.now },
});

export const FxRateModel = mongoose.models.FxRate || mongoose.model<IFxRate>('FxRate', FxRateSchema);

