-- The translate buttons (MEM-44): DeepL towards American English, next to
-- DeepL (now towards British English) and Google. A new value of the type,
-- nothing else: the accounts keep their choice, and the previous version of
-- the API keeps working on this schema during the deployment.
ALTER TYPE "Translator" ADD VALUE 'DeepLAmerican' BEFORE 'Google';
