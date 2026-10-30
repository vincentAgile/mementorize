-- MEM-106: every quote gets a recall hint (`content.hint`, required from now
-- on). The existing quotes get the provisional « Indice de rappel », to be
-- replaced from the list. Data only: `content` is a jsonb column, the schema
-- doesn't change. Idempotent: a quote that already has a hint (not empty, not
-- made of spaces only) is left as it is; the other fields, the learning state
-- and the cards are not touched.
UPDATE "items"
SET "content" = jsonb_set("content", '{hint}', '"Indice de rappel"'::jsonb, true)
WHERE "type" = 'Quote'
  AND coalesce(btrim("content"->>'hint'), '') = '';
