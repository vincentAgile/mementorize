-- MEM-90: the number of pronunciation assessments per user and per day, for the daily cap.
CREATE TABLE "pronunciation_usage" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pronunciation_usage_pkey" PRIMARY KEY ("userId","day")
);

ALTER TABLE "pronunciation_usage" ADD CONSTRAINT "pronunciation_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
