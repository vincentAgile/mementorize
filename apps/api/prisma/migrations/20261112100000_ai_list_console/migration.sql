-- MEM-143: the parameters of the app set in the console, and the counters of
-- the generations of cards by the AI (numbers only). Additive: two new
-- tables; the previous version of the API ignores them.
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "ai_list_usage" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "generations" INTEGER NOT NULL DEFAULT 0,
    "proposed" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_list_usage_pkey" PRIMARY KEY ("userId","day")
);

CREATE INDEX "ai_list_usage_day_idx" ON "ai_list_usage"("day");

ALTER TABLE "ai_list_usage" ADD CONSTRAINT "ai_list_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
