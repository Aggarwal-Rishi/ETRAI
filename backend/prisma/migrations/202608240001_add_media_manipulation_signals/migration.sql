-- Keep deployed media records aligned with the Prisma model.
-- Nullable and idempotent so existing analyses remain valid.
ALTER TABLE "media_analyses"
ADD COLUMN IF NOT EXISTS "manipulationSignalsJson" TEXT;
