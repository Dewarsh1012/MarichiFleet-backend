/**
 * Intentionally empty. All demo seed data (tenants, users, vehicles, drivers,
 * trips, bookings, invoices, approvals, WhatsApp messages, live locations)
 * has been removed for the production-ready foundation. Do not reintroduce
 * demo records here — tenant and user creation now happens exclusively through
 * the env-driven bootstrap (src/db/seeds/mongoSeeder.ts) and the admin API.
 *
 * The `SeedDataset` type is kept as a harmless stub for backward compatibility.
 */

export interface SeedDataset {
  tenants: never[];
  users: never[];
  vehicles: never[];
  drivers: never[];
  trips: never[];
  bookings: never[];
  invoices: never[];
  ledgerEntries: never[];
  exceptions: never[];
  approvals: never[];
  whatsappMessages: never[];
  liveLocations: never[];
}

export const initialSeedData: SeedDataset = {
  tenants: [],
  users: [],
  vehicles: [],
  drivers: [],
  trips: [],
  bookings: [],
  invoices: [],
  ledgerEntries: [],
  exceptions: [],
  approvals: [],
  whatsappMessages: [],
  liveLocations: [],
};
