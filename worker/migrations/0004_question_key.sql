ALTER TABLE public_evidence ADD COLUMN question_key TEXT;

CREATE INDEX IF NOT EXISTS idx_public_evidence_question_key
  ON public_evidence(question_key, received_at DESC);

UPDATE public_evidence
   SET question_key = '__missing_question__'
 WHERE question IS NULL OR trim(question) = '';

UPDATE public_evidence
   SET question_key = lower(trim(question))
 WHERE question IS NOT NULL AND trim(question) != '';

CREATE TABLE IF NOT EXISTS public_cache_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO public_cache_meta (key, value) VALUES ('question_key_backfill', 'pending');
