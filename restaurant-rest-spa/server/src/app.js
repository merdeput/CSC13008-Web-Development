require('dotenv').config();

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { prisma } = require('./lib/prisma');
const { createModels } = require('./models');
const { createServices } = require('./services');
const { createAuthService } = require('./services/auth-service');
const { createAuthEmailSender } = require('./services/auth-email');
const { createAuthRouter } = require('./routes/auth-routes');
const { createPublicRouter } = require('./routes/public-routes');
const { createAdminRouter } = require('./routes/admin-routes');
const { requireAccessToken, requireRole } = require('./middleware/authentication');
const { notFound, errorHandler } = require('./middleware/error-handler');

function createApp(options = {}) {
  const app = express();
  const db = options.db || prisma;
  const services = options.services || createServices(createModels(db));
  const email = createAuthEmailSender(options.sendAuthEmail);
  const authService = options.authService || createAuthService(db, {
    ...(options.authOptions || {}),
    sendOtp: options.sendOtp || email.sendOtp,
    sendPasswordReset: options.sendPasswordReset || email.sendPasswordReset
  });
  const allowedOrigins = String(process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean);
  const clientDist = path.resolve(__dirname, '../../client/dist');

  app.disable('x-powered-by');
  const csp = helmet.contentSecurityPolicy.getDefaultDirectives();
  csp['script-src'] = ["'self'", 'https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/'];
  csp['frame-src'] = ["'self'", 'https://www.google.com/recaptcha/', 'https://recaptcha.google.com/recaptcha/'];
  csp['connect-src'] = ["'self'", 'https://www.google.com/recaptcha/'];
  csp['style-src'] = ["'self'", "'unsafe-inline'", 'https://www.google.com/recaptcha/'];
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: { directives: csp } }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    credentials: true,
    optionsSuccessStatus: 204
  }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, data: { status: 'available' } }));
  const authenticate = requireAccessToken(db, options.authOptions || {});
  // The authentication audit grants the admin UI to every active account, including viewer.
  // Still check the role from the database so an arbitrary role claim cannot grant access.
  const authorizeAdmin = requireRole('viewer', 'admin');
  app.use('/api/auth', createAuthRouter(authService, db, {
    verifyRecaptcha: options.verifyRecaptcha,
    limits: options.authLimits,
    ...(options.authOptions || {})
  }));
  app.use('/api', createPublicRouter(services));
  app.use('/api/admin', authenticate, authorizeAdmin, createAdminRouter(services));
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
