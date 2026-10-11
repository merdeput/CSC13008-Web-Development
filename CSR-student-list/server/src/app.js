import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import studentRoutes from './routes.js';

const app = express();
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
app.use(express.json());
app.use('/api/students', studentRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } }));
app.use(express.static(clientDist));
app.get(['/students', '/team', '/teams'], (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'MALFORMED_JSON', message: 'Request body must contain valid JSON.' } });
  console.error(error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The server could not complete the request.' } });
});

export default app;
