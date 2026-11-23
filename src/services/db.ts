import { neon } from '@neondatabase/serverless'
import type { LeadClassification, NormalizedEvent, SlaConfig } from '../types'
import { businessMinutesBetween } from '../lib/businesstime'

const sql = (databaseUrl: string) => neon(databaseUrl)

export type DbEnv = { DATABASE_URL: string }

// ==========================================
// Eventos (bitacora + dedup atomico)
// ==========================================

/**
 * Inserta el evento crudo.
 * @returns true si es nuevo, false si el event_id ya existia. El ON CONFLICT
 * da el dedup en la base, sin estado en memoria.
 */
export async function recordEvent(
  env: DbEnv,
  event: NormalizedEvent,
  redacted: string | null
): Promise<boolean> {
  const rows = await sql(env.DATABASE_URL)`
    INSERT INTO events (
      source, event_id, thread_key, direction, phone, assignee,
      content_raw, content_redacted, message_type, metadata
    ) VALUES (
      ${event.source}, ${event.eventId}, ${event.threadKey}, ${event.direction},
      ${event.phone}, ${event.assignee}, ${event.content}, ${redacted},
      ${event.messageType}, ${JSON.stringify(event.raw)}::jsonb
    )
    ON CONFLICT (event_id) DO NOTHING
    RETURNING id
  `
  return rows.length > 0
}

// ==========================================
// Estado de conversacion
// ==========================================

export async function registerInbound(env: DbEnv, event: NormalizedEvent): Promise<void> {
  await sql(env.DATABASE_URL)`
    INSERT INTO conversations (
      thread_key, channel, channel_conversation_id, phone, assignee,
      status, last_inbound_at, updated_at
    ) VALUES (
      ${event.threadKey}, ${event.source}, ${event.channelConversationId},
      ${event.phone}, ${event.assignee}, 'open', ${event.timestamp}, NOW()
    )
    ON CONFLICT (thread_key) DO UPDATE SET
      last_inbound_at = EXCLUDED.last_inbound_at,
      assignee        = COALESCE(EXCLUDED.assignee, conversations.assignee),
      status          = 'open',
      -- si el cliente vuelve a escribir, el contador de SLA se reinicia
      sla_breached_at = NULL,
      updated_at      = NOW()
  `
}

export async function registerOutbound(env: DbEnv, event: NormalizedEvent): Promise<void> {
  await sql(env.DATABASE_URL)`
    INSERT INTO conversations (
      thread_key, channel, channel_conversation_id, phone, assignee,
      status, last_outbound_at, first_response_at, updated_at
    ) VALUES (
      ${event.threadKey}, ${event.source}, ${event.channelConversationId},
      ${event.phone}, ${event.assignee}, 'open', ${event.timestamp}, ${event.timestamp}, NOW()
    )
    ON CONFLICT (thread_key) DO UPDATE SET
      last_outbound_at  = EXCLUDED.last_outbound_at,
      first_response_at = COALESCE(conversations.first_response_at, EXCLUDED.first_response_at),
      assignee          = COALESCE(EXCLUDED.assignee, conversations.assignee),
      updated_at        = NOW()
  `
}

export interface SlaCandidate {
  threadKey: string
  phone: string
  assignee: string | null
  lastInboundAt: string
  lastOutboundAt: string | null
  waitingMinutes: number
}

/**
 * Conversaciones abiertas sin respuesta que superaron el umbral. El horario se
 * aplica en JS: SQL no conoce festivos ni jornada.
 */
export async function findSlaBreaches(env: DbEnv, now: Date, cfg: SlaConfig): Promise<SlaCandidate[]> {
  const rows = await sql(env.DATABASE_URL)`
    SELECT thread_key, channel, phone, assignee, last_inbound_at, last_outbound_at
    FROM conversations
    WHERE status = 'open'
      AND sla_breached_at IS NULL
      AND last_inbound_at IS NOT NULL
      AND (last_outbound_at IS NULL OR last_outbound_at < last_inbound_at)
    ORDER BY last_inbound_at ASC
  `

  const breaches: SlaCandidate[] = []
  for (const row of rows) {
    // Solo se auditan los canales que reportan respuestas salientes.
    if (!cfg.channels.has(row.channel as string)) continue
    if (breaches.length >= cfg.maxPerRun) break

    const lastInbound = new Date(row.last_inbound_at as string)
    const lastOutbound = row.last_outbound_at ? new Date(row.last_outbound_at as string) : null
    const reference = (lastOutbound ?? lastInbound).toISOString()
    const minutes = businessMinutesBetween(reference, now.toISOString(), cfg)
    if (minutes >= cfg.thresholdMinutes) {
      breaches.push({
        threadKey: row.thread_key as string,
        phone: row.phone as string,
        assignee: (row.assignee as string | null) ?? null,
        lastInboundAt: lastInbound.toISOString(),
        lastOutboundAt: lastOutbound ? lastOutbound.toISOString() : null,
        waitingMinutes: Math.round(minutes),
      })
    }
  }
  return breaches
}

export async function markSlaBreached(env: DbEnv, threadKey: string): Promise<void> {
  await sql(env.DATABASE_URL)`
    UPDATE conversations SET sla_breached_at = NOW(), updated_at = NOW()
    WHERE thread_key = ${threadKey} AND sla_breached_at IS NULL
  `
}

// ==========================================
// Tareas de auditoria
// ==========================================

export async function createTask(
  env: DbEnv,
  task: {
    threadKey: string
    phone: string
    kind: 'sla_breach' | 'hot_lead' | 'unattended'
    severity: 'alta' | 'media' | 'baja'
    description: string
    priority?: LeadClassification['priority']
    confidence?: number
  }
): Promise<number | null> {
  const rows = await sql(env.DATABASE_URL)`
    INSERT INTO tasks (thread_key, phone, kind, severity, description, priority, confidence)
    VALUES (
      ${task.threadKey}, ${task.phone}, ${task.kind}, ${task.severity},
      ${task.description}, ${task.priority ?? null}, ${task.confidence ?? null}
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `
  return rows.length > 0 ? (rows[0].id as number) : null
}

export async function pendingTasksForPush(env: DbEnv, limit = 20) {
  return sql(env.DATABASE_URL)`
    SELECT id, thread_key, phone, kind, severity, description, priority
    FROM tasks
    WHERE resolved_at IS NULL AND pushed_to_rdstation = FALSE
    ORDER BY created_at ASC
    LIMIT ${limit}
  `
}

// ==========================================
// Consultas de inspeccion
// ==========================================

export async function recentLeads(env: DbEnv, limit = 20) {
  return sql(env.DATABASE_URL)`
    SELECT phone, message_cleaned, message_raw, ai_analysis, created_at
    FROM lead_logs
    ORDER BY id DESC
    LIMIT ${limit}
  `
}

export async function listConversations(env: DbEnv, limit = 50) {
  return sql(env.DATABASE_URL)`
    SELECT thread_key, channel, phone, assignee, status,
           last_inbound_at, last_outbound_at, first_response_at, sla_breached_at
    FROM conversations
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `
}

export async function recentEvents(env: DbEnv, limit = 50) {
  return sql(env.DATABASE_URL)`
    SELECT source, direction, phone, assignee, message_type, created_at
    FROM events
    ORDER BY id DESC
    LIMIT ${limit}
  `
}

export async function listTasks(env: DbEnv, limit = 50) {
  return sql(env.DATABASE_URL)`
    SELECT thread_key, phone, kind, severity, priority, confidence,
           description, pushed_to_rdstation, created_at
    FROM tasks
    ORDER BY id DESC
    LIMIT ${limit}
  `
}

export async function markTasksPushed(env: DbEnv, ids: number[]): Promise<void> {
  if (ids.length === 0) return
  // Neon 0.9.x no expone sql.array(): la lista viaja como texto.
  const idList = ids.join(',')
  await sql(env.DATABASE_URL)`
    UPDATE tasks SET pushed_to_rdstation = TRUE
    WHERE id = ANY(string_to_array(${idList}, ',')::int[])
  `
}

// ==========================================
// Lead log
// ==========================================

/** Guarda el lead con ambas versiones del texto: la cruda y la anonimizada. */
export async function saveLeadLog(
  env: DbEnv,
  args: { phone: string; raw: string; redacted: string; analysis: string }
): Promise<void> {
  await sql(env.DATABASE_URL)`
    INSERT INTO lead_logs (phone, message_cleaned, message_raw, ai_analysis, created_at)
    VALUES (${args.phone}, ${args.redacted}, ${args.raw}, ${args.analysis}, NOW())
  `
}
