require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { createPrismaAdapter } = require('./postgres-adapter');

let client;

function getPrisma() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure Supabase PostgreSQL.');
  }
  if (!client) {
    const adapter = createPrismaAdapter(process.env.DATABASE_URL);
    client = new PrismaClient({ adapter });
  }
  return client;
}

const prisma = new Proxy({}, {
  get(_target, property) {
    const instance = getPrisma();
    const value = instance[property];
    return typeof value === 'function' ? value.bind(instance) : value;
  }
});

async function disconnectPrisma() {
  if (client) await client.$disconnect();
}

module.exports = { prisma, getPrisma, disconnectPrisma };
