require('dotenv').config();

const path = require('node:path');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const { prisma } = require('./lib/prisma');
const { createPrismaSessionStore } = require('./lib/prisma-session-store');
const { createServices } = require('./services');
const { formatVnd, formatDateTimeHcm, todayInHcm } = require('./lib/format');
const { getRestaurantConfig } = require('./lib/restaurant-config');
const { attachCsrfToken } = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/error-handler');
const { createCustomerRouter } = require('./routes/customer-routes');
const { createAdminRouter } = require('./routes/admin-routes');
const { createAuthRouter } = require('./routes/auth-routes');

function createApp(options = {}) {
  if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || Buffer.byteLength(process.env.SESSION_SECRET) < 32)) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes in production.');
  }
  const app = express();
  const services = options.services || createServices(prisma);
  let registrationCleanup;
  if (services.auth && typeof services.auth.pruneExpiredAuthRecords === 'function') {
    registrationCleanup = setInterval(() => {
      services.auth.pruneExpiredAuthRecords().catch((error) => console.error('Authentication cleanup failed:', error.message));
    }, 15 * 60 * 1000);
    registrationCleanup.unref();
  }
  const publicDirectory = path.join(__dirname, '..', 'public');

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('layout', 'layouts/main');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/'],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        frameSrc: ["'self'", 'https://www.google.com/recaptcha/', 'https://recaptcha.google.com/recaptcha/'],
        connectSrc: ["'self'", 'https://www.google.com/recaptcha/'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"]
      }
    }
  }));
  // Parse before method override, and accept overrides only from POST forms.
  app.use(express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 80 }));
  app.use(methodOverride((req) => {
    if (req.method !== 'POST') return undefined;
    const method = typeof req.body._method === 'string' ? req.body._method.toUpperCase() : '';
    return ['PATCH', 'DELETE'].includes(method) ? method : undefined;
  }));
  app.use(express.static(publicDirectory, { maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 }));
  const sessionCookieName = process.env.NODE_ENV === 'production' ? '__Host-bephoi.sid' : 'bephoi.sid';
  app.locals.sessionCookieName = sessionCookieName;
  const sessionStore = options.sessionStore || createPrismaSessionStore(options.prisma || prisma);
  app.locals.closeAuthenticationMaintenance = () => {
    if (registrationCleanup) clearInterval(registrationCleanup);
    if (sessionStore && typeof sessionStore.close === 'function') sessionStore.close();
  };
  app.use(session({
    name: sessionCookieName,
    secret: process.env.SESSION_SECRET || 'development-only-change-this-session-secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 1000 * 60 * 60 * 4
    }
  }));
  app.use(attachCsrfToken);
  app.use(expressLayouts);
  app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.isAdmin = req.path.startsWith('/admin');
    res.locals.authUser = req.session && req.session.userId
      ? { id: req.session.userId, email: req.session.email || '' }
      : null;
    res.locals.formatVnd = formatVnd;
    res.locals.formatDateTimeHcm = formatDateTimeHcm;
    res.locals.todayInHcm = todayInHcm;
    res.locals.restaurantConfig = getRestaurantConfig();
    res.locals.statusLabels = {
      PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', SEATED: 'Đang dùng bữa',
      COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy', NO_SHOW: 'Không đến'
    };
    next();
  });

  app.use('/', createAuthRouter(services, { sessionCookieName, verifyRecaptcha: options.verifyRecaptcha }));
  app.use('/', createCustomerRouter(services));
  app.use('/admin', createAdminRouter(services));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
