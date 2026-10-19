require('dotenv').config();

const { createApp } = require('./app');
const { disconnectPrisma } = require('./lib/prisma');

const port = Number(process.env.PORT) || 3000;
const server = createApp().listen(port, () => console.log(`Bếp Phố API listening on port ${port}`));

async function shutdown() {
  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
