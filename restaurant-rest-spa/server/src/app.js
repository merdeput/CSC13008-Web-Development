require('dotenv').config();

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { prisma } = require('./lib/prisma');
const { createModels } = require('./models');
const { createServices } = require('./services');
const { createPublicRouter } = require('./routes/public-routes');
const { createAdminRouter } = require('./routes/admin-routes');
const { notFound, errorHandler } = require('./middleware/error-handler');

function createApp(options = {}) {
  const app = express();
  const db = options.db || prisma;
  const services = options.services || createServices(createModels(db));
  const allowedOrigins = String(process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean);
  const clientDist = path.resolve(__dirname, '../../client/dist');

  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, data: { status: 'available' } }));
  app.use('/api', createPublicRouter(services));
  app.use('/api/admin', createAdminRouter(services));
  app.use('/api', notFound);

  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 }));
    app.get('*', (req, res, next) => {
      if (!req.accepts('html')) return next();
      return res.sendFile(path.join(clientDist, 'index.html'));
    });
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
