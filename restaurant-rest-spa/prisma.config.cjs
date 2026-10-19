require('dotenv/config');

const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  // DATABASE_URL is a safe fallback for Prisma validation and generation.
  // Set DIRECT_URL before running migrations against Supabase.
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://missing:missing@127.0.0.1:1/restaurant?schema=public'
  }
});
