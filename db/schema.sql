-- Migracion 001: estado de conversaciones, eventos y tareas de SLA
-- Ejecutar en Neon (SQL Editor). Es idempotente: se puede repetir.

-- Texto original del lead. El anonimizado va aparte, en message_cleaned.
ALTER TABLE lead_logs ADD COLUMN IF NOT EXISTS message_raw TEXT;

-- Un webhook solo se dispara ante eventos, asi que "lleva 1h sin responder"
-- no se puede detectar sin este estado mas un cron.
CREATE TABLE IF NOT EXISTS conversations (
  thread_key             TEXT PRIMARY KEY,  -- 'meta:+573...' | 'chatwoot:12345'
  channel                TEXT NOT NULL,     -- 'meta' | 'chatwoot'
  channel_conversation_id TEXT,
  phone                  TEXT NOT NULL,
  assignee               TEXT,              -- agente asignado
  status                 TEXT NOT NULL DEFAULT 'open',
  last_inbound_at        TIMESTAMPTZ,
  last_outbound_at       TIMESTAMPTZ,
  first_response_at      TIMESTAMPTZ,
  sla_breached_at        TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indice parcial: solo las abiertas y aun sin breach.
CREATE INDEX IF NOT EXISTS idx_conv_sla_candidates
  ON conversations (last_inbound_at)
  WHERE status = 'open' AND sla_breached_at IS NULL;

-- Bitacora. event_id UNIQUE da el dedup en la base.
CREATE TABLE IF NOT EXISTS events (
  id              SERIAL PRIMARY KEY,
  source          TEXT NOT NULL,          -- 'meta' | 'chatwoot'
  event_id        TEXT UNIQUE NOT NULL,
  thread_key      TEXT NOT NULL,
  direction       TEXT NOT NULL,          -- 'inbound' | 'outbound'
  phone           TEXT,
  assignee        TEXT,
  content_raw     TEXT,                   -- con PII, para uso interno
  content_redacted TEXT,                  -- sin PII, es lo que ve la IA
  message_type    TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_thread ON events (thread_key, created_at DESC);

-- Hallazgos de la auditoria. Es lo que despues se empuja a RD Station.
CREATE TABLE IF NOT EXISTS tasks (
  id                  SERIAL PRIMARY KEY,
  thread_key          TEXT NOT NULL,
  phone               TEXT NOT NULL,
  kind                TEXT NOT NULL,      -- 'sla_breach' | 'hot_lead' | 'unattended'
  severity            TEXT,               -- 'alta' | 'media' | 'baja'
  description         TEXT,
  priority            TEXT,               -- 'HOT' | 'WARM' | 'COLD'
  confidence          NUMERIC(3,2),
  due_at              TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  pushed_to_rdstation BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_pending ON tasks (created_at) WHERE resolved_at IS NULL;
