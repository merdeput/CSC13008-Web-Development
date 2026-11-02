CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE');

ALTER TABLE "User"
  ADD COLUMN "role" VARCHAR(40) NOT NULL DEFAULT 'viewer',
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "User"
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ALTER COLUMN "emailVerifiedAt" DROP NOT NULL;

DROP TABLE "RegistrationChallenge";

CREATE TABLE "ActivationChallenge" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "purpose" VARCHAR(32) NOT NULL,
  "otpHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMPTZ(6),
  "resendCount" INTEGER NOT NULL DEFAULT 0,
  "lastSentAt" TIMESTAMPTZ(6) NOT NULL,
  "usedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivationChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActivationChallenge_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "ActivationChallenge_resendCount_check" CHECK ("resendCount" >= 0),
  CONSTRAINT "ActivationChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ActivationChallenge_userId_purpose_key" ON "ActivationChallenge"("userId", "purpose");
CREATE INDEX "ActivationChallenge_expiresAt_idx" ON "ActivationChallenge"("expiresAt");

CREATE TABLE "PasswordReset" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "usedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PasswordReset_userId_key" ON "PasswordReset"("userId");
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");
CREATE INDEX "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");

CREATE TABLE "LoginFailureCounter" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "keyType" VARCHAR(16) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMPTZ(6) NOT NULL,
  "lockedUntil" TIMESTAMPTZ(6),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginFailureCounter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoginFailureCounter_failureCount_check" CHECK ("failureCount" >= 0)
);

CREATE UNIQUE INDEX "LoginFailureCounter_keyType_keyHash_key" ON "LoginFailureCounter"("keyType", "keyHash");
CREATE INDEX "LoginFailureCounter_lockedUntil_idx" ON "LoginFailureCounter"("lockedUntil");

DELETE FROM "Session";
ALTER TABLE "Session" ADD COLUMN "userId" UUID;
ALTER TABLE "Session"
  ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
