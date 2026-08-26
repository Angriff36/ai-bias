CREATE TABLE IF NOT EXISTS public_runs (
  id TEXT PRIMARY KEY,
  submission_hash TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('visitor-provider', 'free-trial')),
  created_at TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  complete_pair_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS public_evidence (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES public_runs(id) ON DELETE CASCADE,
  pair_index INTEGER NOT NULL,
  run_index INTEGER NOT NULL,
  question TEXT,
  variant_key TEXT NOT NULL CHECK (variant_key IN ('A', 'B')),
  variant_label TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  status_code INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  error_message TEXT,
  truncated INTEGER NOT NULL DEFAULT 0 CHECK (truncated IN (0, 1)),
  evidence_sha256 TEXT NOT NULL,
  classification TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_public_evidence_model_time ON public_evidence(model_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_evidence_run_pair ON public_evidence(run_id, pair_index, run_index);
CREATE INDEX IF NOT EXISTS idx_public_evidence_status_model ON public_evidence(status, model_id);

CREATE TABLE IF NOT EXISTS model_aggregates (
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  response_count INTEGER NOT NULL DEFAULT 0,
  complete_pair_count INTEGER NOT NULL DEFAULT 0,
  asymmetric_pair_count INTEGER NOT NULL DEFAULT 0,
  answered_count INTEGER NOT NULL DEFAULT 0,
  refusal_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  truncated_count INTEGER NOT NULL DEFAULT 0,
  latency_sum_ms INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (provider, model_id)
);

CREATE TABLE IF NOT EXISTS analysis_snapshots (
  threshold INTEGER PRIMARY KEY,
  aggregate_json TEXT NOT NULL,
  model_id TEXT NOT NULL,
  analysis TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS free_allowances (
  quota_hash TEXT PRIMARY KEY,
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count BETWEEN 0 AND 2),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS free_daily_budget (
  utc_day TEXT PRIMARY KEY,
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count BETWEEN 0 AND 250),
  updated_at TEXT NOT NULL
);
