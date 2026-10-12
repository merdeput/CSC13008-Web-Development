require('dotenv').config();

const { createApp } = require('./app');
const { disconnectPrisma } = require('./lib/prisma');

const port = Number.parseInt(process.env.PORT || '3000', 10);
const app = createApp();
const server = app.listen(port, () => {
  console.log(`Bếp Hội is listening on http://localhost:${port}`);
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not set; database-backed pages need Supabase configuration.');
  }
});

async function shutdown(signal) {
  console.log(`\n${signal} received; closing the server.`);
  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
