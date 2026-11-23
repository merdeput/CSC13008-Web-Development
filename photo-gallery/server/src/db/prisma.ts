import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

export function createPrismaClient(connectionString: string) {
  const adapter = new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 5_000 });
  return new PrismaClient({ adapter });
}
