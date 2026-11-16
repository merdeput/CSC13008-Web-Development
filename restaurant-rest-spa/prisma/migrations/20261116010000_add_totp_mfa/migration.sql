ALTER TABLE "AuthSession"
ADD COLUMN "mfaPending" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE "MfaFactor" (
    "userId" UUID NOT NULL,
    "secretCiphertext" VARCHAR(255),
    "pendingSecretCiphertext" VARCHAR(255),
    "pendingExpiresAt" TIMESTAMPTZ(6),
    "enabledAt" TIMESTAMPTZ(6),
    "lastUsedStep" INTEGER,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaFactor_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "MfaFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MfaFactor_failedAttempts_check" CHECK ("failedAttempts" BETWEEN 0 AND 5),
    CONSTRAINT "MfaFactor_active_secret_check" CHECK ("enabledAt" IS NULL OR "secretCiphertext" IS NOT NULL),
    CONSTRAINT "MfaFactor_pending_pair_check" CHECK (("pendingSecretCiphertext" IS NULL) = ("pendingExpiresAt" IS NULL))
);

CREATE INDEX "MfaFactor_lockedUntil_idx" ON "MfaFactor"("lockedUntil");
ALTER TABLE "MfaFactor" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "MfaRecoveryCode" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMPTZ(6),

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MfaRecoveryCode_codeHash_key" UNIQUE ("codeHash"),
    CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MfaRecoveryCode_factor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "MfaFactor"("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MfaRecoveryCode_userId_usedAt_idx" ON "MfaRecoveryCode"("userId", "usedAt");
ALTER TABLE "MfaRecoveryCode" ENABLE ROW LEVEL SECURITY;

-- TOTP seeds and recovery hashes are server-only; browser roles never access these tables directly.
REVOKE ALL ON TABLE "MfaFactor", "MfaRecoveryCode" FROM PUBLIC;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "MfaFactor", "MfaRecoveryCode" FROM %I', role_name);
    END IF;
  END LOOP;
END;
$$;
