function getJwtConfig(env = process.env) {
  const secret = env.JWT_SIGNING_KEY;
  const issuer = env.JWT_ISSUER;
  const audience = env.JWT_AUDIENCE;
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SIGNING_KEY must contain at least 32 high-entropy bytes.');
  }
  if (typeof issuer !== 'string' || !issuer.trim()) throw new Error('JWT_ISSUER is required.');
  if (typeof audience !== 'string' || !audience.trim()) throw new Error('JWT_AUDIENCE is required.');
  return { secret, issuer: issuer.trim(), audience: audience.trim(), accessTtlSeconds: 15 * 60 };
}

module.exports = { getJwtConfig };
