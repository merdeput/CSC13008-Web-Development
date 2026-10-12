import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { createPrismaAdapter } = require('./postgres-adapter.js');

export async function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to seed Supabase PostgreSQL.');
  }

  return new PrismaClient({
    adapter: createPrismaAdapter(process.env.DATABASE_URL)
  });
}
