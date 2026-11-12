-- MEM-135: the counters of the Chat IA for the console (numbers only).
-- Additive: a new table; the previous version of the API ignores it. Its
-- parameters go into app_settings (MEM-143), under the key « chat ».
CREATE TABLE "chat_usage" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "conversations" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chat_usage_pkey" PRIMARY KEY ("userId","day")
);

CREATE INDEX "chat_usage_day_idx" ON "chat_usage"("day");

ALTER TABLE "chat_usage" ADD CONSTRAINT "chat_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
