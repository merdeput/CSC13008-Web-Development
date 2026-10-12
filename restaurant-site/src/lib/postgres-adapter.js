const fs = require('node:fs');
const path = require('node:path');
const { PrismaPg } = require('@prisma/adapter-pg');

const sslParameters = ['sslmode', 'sslcert', 'sslrootcert', 'sslidentity', 'sslpassword'];

function normalizeConnectionString(connectionString) {
  const url = new URL(connectionString);
  for (const parameter of sslParameters) url.searchParams.delete(parameter);
  return url.toString();
}

function getSslOptions() {
  const caFile = process.env.DATABASE_SSL_CA_FILE;
  if (caFile) {
    return {
      ca: fs.readFileSync(path.resolve(caFile), 'utf8'),
      rejectUnauthorized: true
    };
  }

  // Supabase poolers can present a self-signed certificate. Keep the channel encrypted
  // unless a project CA file is configured to enable server identity verification.
  return { rejectUnauthorized: false };
}

function createPrismaAdapter(connectionString, options = {}) {
  return new PrismaPg({
    ...options,
    connectionString: normalizeConnectionString(connectionString),
    ssl: getSslOptions(),
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5000,
    max: options.max ?? 10
  });
}

module.exports = { createPrismaAdapter, normalizeConnectionString, getSslOptions };
