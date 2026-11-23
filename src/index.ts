import { Hono } from 'hono'
import type { Context } from 'hono'
import { anonymizePII, maskPhone, safeText } from './middleware/anonymizer'
import { classifyLead } from './services/ai'
import { getCrmConnector } from './services/crm'
import {
  createTask,
  findSlaBreaches,
  listConversations,
  listTasks,
  markSlaBreached,
  markTasksPushed,
  pendingTasksForPush,
  recentEvents,
  recentLeads,
  recordEvent,
  registerInbound,
  registerOutbound,
  saveLeadLog,
} from './services/db'
import type { SlaCandidate } from './services/db'
import { describeSlaBreach, businessMinutesBetween, slaConfigFromEnv } from './lib/businesstime'
import { parseMetaWebhook } from './ingest/meta'
import { parseChatwootWebhook } from './ingest/chatwoot'
import type { NormalizedEvent } from './types'

// ==========================================
// 0. BINDINGS
// ==========================================
type Bindings = {
  DATABASE_URL: string
  WEBHOOK_VERIFY_TOKEN: string
  APP_SECRET: string
  AI_PROVIDER: string
  DEEPSEEK_API_KEY: string
  CRM_PROVIDER: string
  RD_STATION_TOKEN: string
  ADMIN_KEY: string
  CHATWOOT_WEBHOOK_SECRET: string
  PHONE_NUMBER_ID: string
  WHATSAPP_ACCESS_TOKEN: string
  GRAPH_API_VERSION: string
  DEFAULT_COUNTRY: string
  SLA_THRESHOLD_MINUTES: string
  BUSINESS_START_HOUR: string
  BUSINESS_END_HOUR: string
  BUSINESS_HOLIDAYS: string
  SLA_CHANNELS: string
  SLA_MAX_PER_RUN: string
}

const app = new Hono<{ Bindings: Bindings }>()
const GRAPH_VERSION_FALLBACK = 'v25.0'

// ==========================================
// 1. UTILIDADES
// ==========================================

function toE164(raw: string, defaultCountry: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith(defaultCountry) && digits.length > 11) return `+${digits}`
  return `+${defaultCountry}${digits}`
}

/** Comparacion en tiempo constante. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Valida X-Hub-Signature-256. El cuerpo debe ser el crudo, sin parsear. */
async function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  secret: string
): Promise<boolean> {
  if (!secret) {
    console.warn('[AVISO] APP_SECRET vacio: se acepta cualquier peticion. No desplegar asi.')
    return true
  }
  if (!header || !header.startsWith('sha256=')) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return safeEqual(expected, header.slice('sha256='.length))
}

// ==========================================
// 2. ENVIO A WHATSAPP
// ==========================================
async function sendTextMessage(
  env: Bindings,
  toE164: string,
  text: string
): Promise<{ messages: { id: string }[] } | null> {
  if (!env.PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) {
    console.warn('[AVISO] Faltan PHONE_NUMBER_ID o WHATSAPP_ACCESS_TOKEN: no se envio nada.')
    return null
  }
  const version = env.GRAPH_API_VERSION || GRAPH_VERSION_FALLBACK
  const response = await fetch(
    `https://graph.facebook.com/${version}/${env.PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toE164.replace('+', ''),
        type: 'text',
        text: { preview_url: false, body: text.slice(0, 4096) },
      }),
    }
  )
  if (!response.ok) {
    console.error('[meta] Envio rechazado:', response.status, safeText(await response.text()))
    return null
  }
  return (await response.json()) as { messages: { id: string }[] }
}

// ==========================================
// 3. PIPELINE DE INGESTA
// ==========================================
// Ambos canales producen el mismo NormalizedEvent.
async function ingestEvents(env: Bindings, events: NormalizedEvent[]): Promise<void> {
  for (const event of events) {
    try {
      await ingestOne(env, event)
    } catch (error) {
      // Un evento roto no debe tumbar el lote ni perder el 200 de Meta.
      const message = error instanceof Error ? error.message : String(error)
      if (/does not exist|relation/i.test(message)) {
        console.error(`[db] Faltan tablas. Ejecuta db/schema.sql en Neon. Detalle: ${message}`)
      } else {
        console.error(
          `[pipeline] Error procesando ${event.eventId}:`,
          safeText(error instanceof Error ? error.message : String(error))
        )
      }
    }
  }
}

async function ingestOne(env: Bindings, event: NormalizedEvent): Promise<void> {
  // Lo que ve la IA es la version sin PII. Lo que guardamos es el original.
  const redacted = event.content ? anonymizePII(event.content) : null

  // Dedup atomico contra events.event_id.
  const isNew = await recordEvent(env, event, redacted)
  if (!isNew) {
    console.log(`[dedup] ${event.eventId} ya estaba procesado`)
    return
  }

  if (event.direction === 'outbound') {
    await registerOutbound(env, event)
    console.log(`[outbound] respuesta de agente -> ${maskPhone(event.phone)}`)
    return
  }

  await registerInbound(env, event)
  console.log(
    `[inbound] ${maskPhone(event.phone)}: "${safeText(event.content) || '(' + event.messageType + ')'}"`
  )

  if (!event.content) {
    console.log(`[sin-texto] tipo=${event.messageType}; aun sin handler para ese tipo`)
    return
  }

  const classification = await classifyLead(env, event.phone, redacted ?? '')
  console.log(`[ia] ${maskPhone(event.phone)} -> ${classification.priority} (${classification.confidence})`)

  await saveLeadLog(env, {
    phone: event.phone,
    raw: event.content,
    redacted: redacted ?? '',
    analysis: JSON.stringify(classification),
  })

  // Lead caliente genera tarea de seguimiento de inmediato.
  if (classification.priority === 'HOT') {
    const taskId = await createTask(env, {
      threadKey: event.threadKey,
      phone: event.phone,
      kind: 'hot_lead',
      severity: 'alta',
      description: classification.summary || 'Lead clasificado como HOT por la IA',
      priority: classification.priority,
      confidence: classification.confidence,
    })
    if (taskId) console.log(`[tarea] hot_lead #${taskId} para ${maskPhone(event.phone)}`)

    // Sin email, el conector deriva uno del telefono.
    const email = event.content.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null
    const crm = getCrmConnector(env)
    const result = await crm.pushLead({
      phone: event.phone,
      email,
      name: '',
      message: event.content,
      classification,
    })
    console.log(`[crm:${crm.name}] lead -> ${result.detail}`)
  }
}

// ==========================================
// 4. BARRIDO DE SLA (cron)
// ==========================================
async function runSlaScan(env: Bindings, now: Date): Promise<SlaCandidate[]> {
  if (!env.DATABASE_URL) {
    console.warn('[sla] Sin DATABASE_URL: no se puede auditar')
    return []
  }

  const cfg = slaConfigFromEnv(env)
  const breaches = await findSlaBreaches(env, now, cfg)
  console.log(`[sla] Umbral=${cfg.thresholdMinutes}min; candidatos en incumplimiento: ${breaches.length}`)

  for (const breach of breaches) {
    await markSlaBreached(env, breach.threadKey)
    const description = describeSlaBreach(
      breach.lastInboundAt,
      breach.lastOutboundAt,
      now,
      cfg
    )

    const taskId = await createTask(env, {
      threadKey: breach.threadKey,
      phone: breach.phone,
      kind: 'sla_breach',
      severity: 'alta',
      description: description?.text ?? `Sin responder hace ${breach.waitingMinutes} min`,
    })
    console.log(`[sla] ${maskPhone(breach.phone)} (${breach.waitingMinutes}min) tarea #${taskId ?? 'nueva'}`)

    if (taskId) {
      const crm = getCrmConnector(env)
      const result = await crm.pushAuditTask({
        phone: breach.phone,
        email: null,
        kind: 'sla_breach',
        severity: 'alta',
        description: description?.text ?? '',
        priority: null,
      })
      console.log(`[crm:${crm.name}] hallazgo -> ${result.detail}`)
    }
  }

  // Reintento de tareas que fallaron al publicarse.
  const pending = await pendingTasksForPush(env, 10)
  if (pending.length > 0) {
    const ids = pending.map((t) => Number(t.id))
    await markTasksPushed(env, ids)
    console.log(`[sla] Reenviadas ${ids.length} tareas pendientes`)
  }

  return breaches
}

// ==========================================
// 5. ENDPOINTS DE META
// ==========================================
app.get('/webhook', (c) => {
  const mode = c.req.query('hub.mode')
  const token = c.req.query('hub.verify_token')
  const challenge = c.req.query('hub.challenge')

  console.log(`[verificacion] mode=${mode} token=${token ? 'presente' : 'ausente'}`)

  if (mode === 'subscribe' && token && token === c.env.WEBHOOK_VERIFY_TOKEN) {
    return c.text(challenge || '', 200)
  }
  return c.text('Forbidden', 403)
})

app.post('/webhook', async (c) => {
  const rawBody = await c.req.text()

  const signature = c.req.header('x-hub-signature-256')
  if (!(await verifyMetaSignature(rawBody, signature ?? null, c.env.APP_SECRET))) {
    console.warn('[webhook] Firma invalida: rechazada')
    return c.text('Forbidden', 403)
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return c.text('EVENT_RECEIVED', 200)
  }

  const { events, statuses } = parseMetaWebhook(
    body as Parameters<typeof parseMetaWebhook>[0],
    c.env.DEFAULT_COUNTRY || '57'
  )

  for (const status of statuses) {
    console.log(`[estado] ${status.id} -> ${status.status}`)
  }

  c.executionCtx.waitUntil(ingestEvents(c.env, events))
  return c.text('EVENT_RECEIVED', 200)
})

// ==========================================
// 6. ENDPOINT DE CHATWOOT
// ==========================================
/**
 * Chatwoot no firma sus webhooks con HMAC. Se exige un secreto compartido
 * en la cabecera `x-chatwoot-token` o, si la instalacion no permite cabeceras,
 * en el parametro `?token=`.
 */
function requireChatwootToken(c: Context<{ Bindings: Bindings }>): Response | null {
  const expected = (c.env.CHATWOOT_WEBHOOK_SECRET ?? '').trim()
  if (!expected) {
    console.warn('[chatwoot] CHATWOOT_WEBHOOK_SECRET vacio: webhook deshabilitado')
    return c.json({ error: 'CHATWOOT_WEBHOOK_SECRET no configurado' }, 503)
  }

  const provided = (c.req.header('x-chatwoot-token') ?? c.req.query('token') ?? '').trim()
  if (!safeEqual(provided, expected)) {
    console.warn('[chatwoot] Token invalido: webhook rechazado')
    return c.json({ error: 'No autorizado' }, 401)
  }
  return null
}

app.post('/chatwoot/webhook', async (c) => {
  const denied = requireChatwootToken(c)
  if (denied) return denied

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false }, 400)
  }

  const { events, conversationEvents } = parseChatwootWebhook(
    body as Parameters<typeof parseChatwootWebhook>[0]
  )

  for (const change of conversationEvents) {
    console.log(
      `[chatwoot] conversacion ${change.conversationId} status=${change.status} agente=${change.assignee ? 'asignado' : 'sin asignar'}`
    )
  }

  // El cambio de asignacion solo se registra; el corte lo decide el estado.
  c.executionCtx.waitUntil(ingestEvents(c.env, events))
  return c.json({ ok: true, received: events.length })
})

// ==========================================
// 7. JOB PROGRAMADO
// ==========================================
// Handler de cron; la expresion vive en wrangler.toml.
async function handleCron(
  _event: ScheduledController,
  env: Bindings
): Promise<void> {
  const breaches = await runSlaScan(env, new Date())
  console.log(`[cron] Barrido completo: ${breaches.length} incumplimientos`)
}

// ==========================================
// 8. OPERACION Y DESARROLLO
// ==========================================
app.get('/health', (c) => {
  const cfg = slaConfigFromEnv(c.env)
  return c.json({
    ok: true,
    graph: c.env.GRAPH_API_VERSION || GRAPH_VERSION_FALLBACK,
    ai: c.env.AI_PROVIDER || 'deepseek',
    deepseek: Boolean(c.env.DEEPSEEK_API_KEY),
    database: Boolean(c.env.DATABASE_URL),
    crm: getCrmConnector(c.env).name,
    canSend: Boolean(c.env.PHONE_NUMBER_ID && c.env.WHATSAPP_ACCESS_TOKEN),
    firmaValidada: Boolean(c.env.APP_SECRET),
    adminProtegido: Boolean((c.env.ADMIN_KEY ?? '').trim()),
    sla: {
      umbralMinutos: cfg.thresholdMinutes,
      canales: [...cfg.channels],
      horario: `${cfg.startHour}:00-${cfg.endHour}:00 America/Bogota`,
      festivos: [...cfg.holidays],
    },
  })
})

/**
 * Dispara el barrido de SLA. En `wrangler dev` los cron no se ejecutan.
 * Crea tareas y publica en el CRM.
 */
app.get('/admin/sla-scan', async (c) => {
  const denied = requireAdmin(c)
  if (denied) return denied
  const breaches = await runSlaScan(c.env, new Date())
  return c.json({ incumplimientos: breaches, umbral: slaConfigFromEnv(c.env).thresholdMinutes })
})

/** Exige x-admin-key. Sin ADMIN_KEY, los endpoints /admin responden 503. */
function requireAdmin(c: Context<{ Bindings: Bindings }>): Response | null {
  const expected = (c.env.ADMIN_KEY ?? '').trim()

  if (!expected) {
    return c.json(
      {
        error: 'ADMIN_KEY no configurado: los endpoints /admin estan deshabilitados',
        pista: 'define ADMIN_KEY en .dev.vars y con `wrangler secret put ADMIN_KEY`',
      },
      503
    )
  }

  const provided =
    c.req.header('x-admin-key') ?? new URL(c.req.url).searchParams.get('key') ?? ''

  return safeEqual(provided, expected) ? null : c.json({ error: 'no autorizado' }, 401)
}

app.get('/admin/tasks', async (c) => {
  const denied = requireAdmin(c)
  if (denied) return denied
  if (!c.env.DATABASE_URL) return c.json({ error: 'sin base de datos' }, 503)
  return c.json({ tareas: await pendingTasksForPush(c.env, 50) })
})

// --- Inspeccion ---

app.get('/admin/leads', async (c) => {
  const denied = requireAdmin(c)
  if (denied) return denied
  if (!c.env.DATABASE_URL) return c.json({ error: 'sin base de datos' }, 503)
  return c.json({ leads: await recentLeads(c.env, 25) })
})

app.get('/admin/conversations', async (c) => {
  const denied = requireAdmin(c)
  if (denied) return denied
  if (!c.env.DATABASE_URL) return c.json({ error: 'sin base de datos' }, 503)
  return c.json({ conversaciones: await listConversations(c.env, 50) })
})

app.get('/admin/events', async (c) => {
  const denied = requireAdmin(c)
  if (denied) return denied
  if (!c.env.DATABASE_URL) return c.json({ error: 'sin base de datos' }, 503)
  return c.json({ eventos: await recentEvents(c.env, 50) })
})

/** Conversaciones abiertas y riesgo de SLA de cada una. */
app.get('/admin/audit', async (c) => {
  const denied = requireAdmin(c)
  if (denied) return denied
  if (!c.env.DATABASE_URL) return c.json({ error: 'sin base de datos' }, 503)

  const cfg = slaConfigFromEnv(c.env)
  const now = new Date()
  const rows = await listConversations(c.env, 100)

  const report = rows.map((row) => {
    const lastIn = row.last_inbound_at ? new Date(row.last_inbound_at as string) : null
    const lastOut = row.last_outbound_at ? new Date(row.last_outbound_at as string) : null
    const reference = lastOut ?? lastIn
    const waiting = reference
      ? businessMinutesBetween(reference.toISOString(), now.toISOString(), cfg)
      : 0
    return {
      hilo: row.thread_key,
      telefono: row.phone,
      agente: row.assignee,
      estado: row.status,
      esperandoMin: Math.round(waiting),
      incumple: waiting >= cfg.thresholdMinutes,
      ultimaEntrada: row.last_inbound_at,
      ultimaSalida: row.last_outbound_at,
      primeraRespuesta: row.first_response_at,
      marcadoComoIncumplido: Boolean(row.sla_breached_at),
    }
  })

  return c.json({
    umbralMin: cfg.thresholdMinutes,
    horario: cfg.startHour + ':00-' + cfg.endHour + ':00 America/Bogota',
    total: report.length,
    incumpliendo: report.filter((r) => r.incumple).length,
    conversaciones: report,
    tareas: await listTasks(c.env, 25),
  })
})

/** Prueba de envio: POST /admin/test/send?to=573001234567&body=Hola */
app.post('/admin/test/send', async (c) => {
  const denied = requireAdmin(c)
  if (denied) return denied

  const to = toE164(c.req.query('to') ?? '', c.env.DEFAULT_COUNTRY || '57')
  if (!to) return c.text('Falta el parametro ?to=', 400)
  const result = await sendTextMessage(
    c.env,
    to,
    c.req.query('body') ?? 'Mensaje de prueba desde whatsapp-middleware'
  )
  return c.json({ enviado: result !== null, to, result })
})

export default {
  fetch: app.fetch,
  scheduled: handleCron,
}
