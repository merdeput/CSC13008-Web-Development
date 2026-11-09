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
const { createAuthRouter } = require('./routes/auth-routes');
const { notFound, errorHandler } = require('./middleware/error-handler');
const { getJwtConfig } = require('./lib/jwt-config');
const { createTokenSessionService } = require('./services/token-session-service');
const { createCsrfMiddleware } = require('./middleware/csrf');
const { requireAccessToken } = require('./middleware/require-access-token');

function createApp(options = {}) {
  const app = express();
  const db = options.db || prisma;
  const secureCookies = options.secureCookies ?? process.env.NODE_ENV === 'production';
  const jwtConfig = options.jwtConfig || getJwtConfig();
  const csrfSecret = options.csrfSecret || process.env.CSRF_HMAC_SECRET;
  if (typeof csrfSecret !== 'string' || Buffer.byteLength(csrfSecret, 'utf8') < 32) {
    throw new Error('CSRF_HMAC_SECRET must contain at least 32 high-entropy bytes.');
  }
  const trustedOrigins = options.trustedOrigins || String(process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean);
  if (!trustedOrigins.length) throw new Error('At least one trusted CLIENT_ORIGIN is required.');
  const services = options.services || createServices(createModels(db), {
    db,
    authOptions: { passwordResetPath: '/reset-password', passwordResetTokenInFragment: true }
  });
  const tokenSessions = options.tokenSessions || createTokenSessionService(db);
  const csrfMiddleware = createCsrfMiddleware({ secret: csrfSecret, trustedOrigins, secureCookies });
  let authCleanupTimer;
  if (tokenSessions && typeof tokenSessions.pruneExpired === 'function' && options.disableAuthCleanup !== true) {
    authCleanupTimer = setInterval(() => {
      tokenSessions.pruneExpired().catch((error) => console.error('[auth] session cleanup failed', { name: error?.name, code: error?.code }));
    }, 60 * 60 * 1000);
    authCleanupTimer.unref();
  }
  app.locals.closeAuthCleanup = () => { if (authCleanupTimer) clearInterval(authCleanupTimer); };
  const clientDist = path.resolve(__dirname, '../../client/dist');

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, false);
      return callback(null, trustedOrigins.includes(origin) ? origin : false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
  }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, data: { status: 'available' } }));
  app.use('/api/auth', createAuthRouter({
    services, tokenSessions, jwtConfig, csrfSecret, csrfMiddleware, secureCookies,
    verifyCaptcha: options.verifyRecaptcha
  }));
  app.use('/api', createPublicRouter(services));
  app.use('/api/admin', requireAccessToken({ jwtConfig, tokenSessions }), createAdminRouter(services));
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
