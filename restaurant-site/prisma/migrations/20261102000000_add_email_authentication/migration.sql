CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(254) NOT NULL,
  "passwordHash" VARCHAR(255) NOT NULL,
  "emailVerifiedAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "RegistrationChallenge" (
  "id" UUID NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "otpDigest" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "resendCount" INTEGER NOT NULL DEFAULT 0,
  "lastSentAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistrationChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RegistrationChallenge_attemptCount_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "RegistrationChallenge_resendCount_check" CHECK ("resendCount" >= 0)
);

CREATE UNIQUE INDEX "RegistrationChallenge_email_key" ON "RegistrationChallenge"("email");
CREATE INDEX "RegistrationChallenge_expiresAt_idx" ON "RegistrationChallenge"("expiresAt");

CREATE TABLE "Session" (
  "id" VARCHAR(255) NOT NULL,
  "sid" VARCHAR(255) NOT NULL,
  "data" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_sid_key" ON "Session"("sid");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
