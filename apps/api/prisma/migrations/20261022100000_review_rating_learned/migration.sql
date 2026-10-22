-- MEM-22: "Learned" in the review history. A new enum value is invisible to
-- the previous version of the API, which never writes it.
ALTER TYPE "ReviewRating" ADD VALUE 'Learned';
