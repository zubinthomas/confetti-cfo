import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.ts';
import entityRoutes from './routes/entities.ts';
import integrationRoutes from './routes/integrations.ts';
import referenceRoutes from './routes/reference.ts';
import financialRecordsRoutes from './routes/financialRecords.ts';
import salesRecordsRoutes from './routes/salesRecords.ts';
import consignmentRecordsRoutes from './routes/consignmentRecords.ts';
import revenueTargetsRoutes from './routes/revenueTargets.ts';
import importRoutes from './routes/import.ts';
import sheetsRoutes from './routes/sheets.ts';
import settingsRoutes from './routes/settings.ts';
import invitesRoutes from './routes/invites.ts';
import rolesRoutes from './routes/roles.ts';
import usersRoutes from './routes/users.ts';
import inventoryRoutes from './routes/inventory.ts';
import reservationsRoutes from './routes/reservations.ts';
import guestSignInsRoutes from './routes/guestSignIns.ts';
import recruitmentHireRoutes from './routes/recruitmentHire.ts';
import offboardingRoutes from './routes/offboarding.ts';
import { startSheetsScheduler } from './sheets/scheduler.ts';
import { config } from 'dotenv';

config()

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

console.log(process.env.CLIENT_URL)
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/entities', entityRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/reference', referenceRoutes);
app.use('/api/financial-records', financialRecordsRoutes);
app.use('/api/sales-records', salesRecordsRoutes);
app.use('/api/consignment-records', consignmentRecordsRoutes);
app.use('/api/revenue-targets', revenueTargetsRoutes);
app.use('/api/import', importRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/invites', invitesRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/guest-sign-ins', guestSignInsRoutes);
app.use('/api/recruitment', recruitmentHireRoutes);
app.use('/api/employees', offboardingRoutes);

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const server = app.listen(PORT, () => {
  console.log(`✅ Express server running on http://localhost:${PORT}`);
  startSheetsScheduler();
});
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use - another server instance is running. Stop it first (PGlite is single-process, so two servers must never share the database).`);
  } else {
    console.error('❌ Server failed to start:', err);
  }
  process.exit(1);
});
