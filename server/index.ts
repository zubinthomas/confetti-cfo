import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.ts';
import entityRoutes from './routes/entities.ts';
import integrationRoutes from './routes/integrations.ts';
import datasetRoutes from './routes/dataset.ts';
import importRoutes from './routes/import.ts';
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
app.use('/api/dataset', datasetRoutes);
app.use('/api/import', importRoutes);

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const server = app.listen(PORT, () => {
  console.log(`✅ Express server running on http://localhost:${PORT}`);
});
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use — another server instance is running. Stop it first (PGlite is single-process, so two servers must never share the database).`);
  } else {
    console.error('❌ Server failed to start:', err);
  }
  process.exit(1);
});
