import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { requestIdMiddleware } from './platform/middleware/requestId.js';
import { authMiddleware } from './platform/middleware/auth.js';
import { tenantScopeMiddleware } from './platform/middleware/tenantScope.js';
import { idempotencyMiddleware } from './platform/middleware/idempotency.js';
import { errorHandler } from './platform/middleware/errorHandler.js';
import { AppError } from './platform/errors.js';
import { getDatabaseStatus } from './db/client.js';

// Modules
import { authRouter } from './modules/auth/auth.router.js';
import { tripsRouter } from './modules/trips/trips.router.js';
import { bookingsRouter } from './modules/bookings/bookings.router.js';
import { fleetRouter } from './modules/fleet/fleet.router.js';
import { financeRouter } from './modules/finance/finance.router.js';
import { ledgerRouter } from './modules/ledger/ledger.router.js';
import { towerRouter } from './modules/tower/tower.router.js';
import { approvalsRouter } from './modules/approvals/approvals.router.js';
import { fuelRouter } from './modules/fuel/fuel.router.js';
import { whatsappRouter } from './modules/whatsapp/whatsapp.router.js';
import { customersRouter } from './modules/customers/customers.router.js';
import { vendorsRouter } from './modules/vendors/vendors.router.js';
import { documentsRouter } from './modules/documents/documents.router.js';
import { complianceRouter } from './modules/compliance/compliance.router.js';
import { expensesRouter } from './modules/expenses/expenses.router.js';
import { incidentsRouter } from './modules/incidents/incidents.router.js';
import { podRouter } from './modules/pod/pod.router.js';
import { workshopRouter } from './modules/workshop/workshop.router.js';
import { hrRouter } from './modules/hr/hr.router.js';
import { geofencesRouter } from './modules/geofences/geofences.router.js';
import { dashboardRouter } from './modules/dashboard/dashboard.router.js';
import { analyticsRouter } from './modules/analytics/analytics.router.js';
import { routesRouter } from './modules/routes/routes.router.js';
import { adminRouter } from './modules/admin/admin.router.js';
import { consignorsRouter } from './modules/consignors/consignors.router.js';
import { consigneesRouter } from './modules/consignees/consignees.router.js';
import { consignmentsRouter } from './modules/consignments/consignments.router.js';
import { portalsRouter } from './modules/portals/portals.router.js';
import { reportsRouter } from './modules/reports/reports.router.js';
import { currencyRouter, getSupportedCurrenciesHandler } from './modules/currency/currency.router.js';
import { initPlaybookEngine } from './platform/playbooks/playbookEngine.js';

// Initialize Playbook automation listener
initPlaybookEngine();

export const app = express();

// 1. CORS
const allowedOrigins = (env.CORS_ORIGIN || '*').split(',').map((o) => o.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server, Render internal)
      if (!origin) return callback(null, true);
      // Allow wildcard or matched origins
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Automatically permit any Vercel deployment preview or production domain
      if (origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }
      // Permissive fallback
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'Idempotency-Key', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['x-request-id'],
  })
);

// 2. Body Parser
app.use(express.json({ limit: '2mb' }));

// 3. Request Tracing
app.use(requestIdMiddleware);

// 4. Root & Health Checks (unauthenticated)
app.get('/', (_req, res) => {
  res.json({
    success: true,
    service: 'MarichiFleet OS Core API',
    status: 'running',
    version: '1.0.0',
    documentation: 'Standalone MERN backend for transport logistics ERP',
    frontendUrl: 'http://localhost:8080',
    endpoints: {
      health: '/api/health',
      healthz: '/healthz',
      dashboardStats: '/api/dashboard/stats',
      fleetVehicles: '/api/fleet/vehicles',
      fleetDrivers: '/api/fleet/drivers',
      trips: '/api/trips',
      bookings: '/api/bookings',
      customers: '/api/customers',
      vendors: '/api/vendors',
      financeInvoices: '/api/finance/invoices',
      controlTower: '/api/tower/vehicles',
      fuelLogs: '/api/fuel',
      workshop: '/api/workshop/job-cards',
      compliance: '/api/compliance',
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/healthz', (_req, res) => {
  res.json({
    status: 'ok',
    service: env.SERVICE_NAME,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    db: getDatabaseStatus(),
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    environment: env.NODE_ENV,
    version: '1.0.0',
    db: getDatabaseStatus(),
  });
});

// 5. Public routes (no auth/tenant required)
app.get(`${env.API_PREFIX}/currency/supported`, getSupportedCurrenciesHandler);
app.use(`${env.API_PREFIX}/auth`, authRouter);

// 6. Auth Context & Idempotency (for protected routes only)
app.use(authMiddleware);
app.use(tenantScopeMiddleware);
app.use(idempotencyMiddleware);

// 7. Protected API Route Modules
const api = express.Router();
api.use('/trips', tripsRouter);
api.use('/bookings', bookingsRouter);
api.use('/fleet', fleetRouter);
api.use('/finance', financeRouter);
api.use('/ledger', ledgerRouter);
api.use('/tower', towerRouter);
api.use('/approvals', approvalsRouter);
api.use('/fuel', fuelRouter);
api.use('/whatsapp', whatsappRouter);
api.use('/customers', customersRouter);
api.use('/vendors', vendorsRouter);
api.use('/documents', documentsRouter);
api.use('/compliance', complianceRouter);
api.use('/expenses', expensesRouter);
api.use('/incidents', incidentsRouter);
api.use('/pod', podRouter);
api.use('/workshop', workshopRouter);
api.use('/hr', hrRouter);
api.use('/geofences', geofencesRouter);
api.use('/dashboard', dashboardRouter);
api.use('/analytics', analyticsRouter);
api.use('/routes', routesRouter);
api.use('/admin', adminRouter);
api.use('/consignors', consignorsRouter);
api.use('/consignees', consigneesRouter);
api.use('/consignments', consignmentsRouter);
api.use('/portals', portalsRouter);
api.use('/reports', reportsRouter);
api.use('/currency', currencyRouter);

app.use(env.API_PREFIX, api);

// 7. 404 Catch-all
app.use((req, _res, next) => {
  next(AppError.notFound('Endpoint', `${req.method} ${req.path}`));
});

// 8. Global Error Handler
app.use(errorHandler);
