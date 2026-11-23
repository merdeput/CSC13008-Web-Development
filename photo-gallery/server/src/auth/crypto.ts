import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const scryptAsync = (password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number; maxmem: number }) =>
  new Promise<Buffer>((resolve, reject) => scrypt(password, salt, keyLength, options, (error, result) => error ? reject(error) : resolve(result as Buffer)));

const work = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 32, work);
  return `scrypt:${work.N}:${work.r}:${work.p}:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [, n, r, p, saltHex, keyHex] = encoded.split(":");
  const N = Number(n); const blockSize = Number(r); const parallel = Number(p);
  if (!saltHex || !keyHex || !Number.isInteger(N) || !Number.isInteger(blockSize) || !Number.isInteger(parallel) || N < 16_384 || N > 131_072 || blockSize < 1 || blockSize > 16 || parallel < 1 || parallel > 4) return false;
  const salt = Buffer.from(saltHex, "hex"); const expected = Buffer.from(keyHex, "hex");
  if (salt.length !== 16 || expected.length !== 32) return false;
  const actual = await scryptAsync(password, salt, expected.length, { N, r: blockSize, p: parallel, maxmem: 128 * 1024 * 1024 });
  return timingSafeEqual(actual, expected);
}

export const hashOpaqueToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newOpaqueToken = () => randomBytes(32).toString("hex");
