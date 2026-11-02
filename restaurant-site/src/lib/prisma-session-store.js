const session = require('express-session');

class PrismaSessionStore extends session.Store {
  constructor(db, options = {}) {
    super();
    this.db = db;
    this.pruneIntervalMs = options.pruneIntervalMs || 5 * 60 * 1000;
    this.pruneTimer = setInterval(() => {
      this.prune().catch((error) => console.error('Session cleanup failed:', error.message));
    }, this.pruneIntervalMs);
    this.pruneTimer.unref();
  }

  get(sid, callback) {
    this.db.session.findUnique({ where: { sid } })
      .then(async (record) => {
        if (!record) return null;
        if (record.expiresAt <= new Date()) {
          await this.db.session.deleteMany({ where: { sid } });
          return null;
        }
        try {
          return JSON.parse(record.data);
        } catch {
          await this.db.session.deleteMany({ where: { sid } });
          return null;
        }
      })
      .then((sessionData) => ({ sessionData }), (error) => ({ error }))
      .then(({ sessionData, error }) => {
        if (error) return callback(error);
        return callback(null, sessionData);
      });
  }

  set(sid, sessionData, callback) {
    const expiresAt = this.getExpiry(sessionData);
    const data = JSON.stringify(sessionData);
    this.db.session.upsert({
      where: { sid },
      create: { id: sid, sid, userId: sessionData && sessionData.userId || null, data, expiresAt },
      update: { userId: sessionData && sessionData.userId || null, data, expiresAt }
    }).then(() => callback(null), callback);
  }

  touch(sid, sessionData, callback) {
    this.db.session.updateMany({
      where: { sid },
      data: { expiresAt: this.getExpiry(sessionData) }
    }).then(() => callback(null), callback);
  }

  destroy(sid, callback) {
    this.db.session.deleteMany({ where: { sid } })
      .then(() => callback(null), callback);
  }

  async prune() {
    await this.db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  }

  close(callback = () => {}) {
    clearInterval(this.pruneTimer);
    callback();
  }

  getExpiry(sessionData) {
    const expires = sessionData && sessionData.cookie && sessionData.cookie.expires;
    if (expires) return new Date(expires);
    const maxAge = sessionData && sessionData.cookie && sessionData.cookie.maxAge;
    return new Date(Date.now() + (Number.isFinite(maxAge) ? maxAge : 4 * 60 * 60 * 1000));
  }
}

function createPrismaSessionStore(db, options) {
  return new PrismaSessionStore(db, options);
}

module.exports = { PrismaSessionStore, createPrismaSessionStore };
