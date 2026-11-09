const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('JWT refresh migration is additive and leaves legacy auth data and sessions intact', () => {
  const migrationPath = path.join(__dirname, '..', 'prisma', 'migrations', '20261109010000_add_jwt_refresh_sessions', 'migration.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /CREATE TABLE "AuthSession"/);
  assert.match(sql, /CREATE TABLE "RefreshToken"/);
  assert.match(sql, /REFERENCES "User"\("id"\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /^\s*(?:DROP\s+(?:TABLE|INDEX|TYPE)|DELETE\s+FROM|TRUNCATE\s+)/im);
  assert.match(sql, /REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC/);
  assert.match(sql, /ARRAY\['anon', 'authenticated'\]/);
  assert.match(sql, /ALTER TABLE "User" ENABLE ROW LEVEL SECURITY/);
});
