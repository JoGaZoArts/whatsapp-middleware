import type { NormalizedEvent } from '../types'

// Chatwoot reporta los mensajes salientes de los agentes
// (message_type: "outgoing"), que es lo que necesita la auditoria.

interface ChatwootWebhookBody {
  event?: string
  id?: number | string
  content?: string
  message_type?: string
  content_type?: string
  created_at?: number | string
  private?: boolean
  status?: string
  inbox_id?: number
  account?: { id?: number | string }
  contact?: { id?: number | string; name?: string; phone_number?: string }
  sender?: {
    id?: number | string
    name?: string
    phone_number?: string
    type?: string
  }
  conversation?: {
    id?: number | string
    display_id?: number | string
    status?: string
    additional_attributes?: unknown
    contact?: { id?: number | string; name?: string; phone_number?: string }
    meta?: {
      assignee?: { name?: string } | null
      sender?: { type?: string; name?: string; phone_number?: string } | null
    }
    messages?: unknown[]
  }
  message_status?: string
}

function firstNonEmpty(...values: (string | undefined | null)[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
  }
  return ''
}

function toIsoTimestamp(value: number | string | undefined): string {
  if (value === undefined || value === null) return new Date().toISOString()
  // Chatwoot envia epoch en segundos; algunos payloads traen ISO.
  if (typeof value === 'number') return new Date(value * 1000).toISOString()
  const numeric = Number(value)
  if (!Number.isNaN(numeric) && numeric > 0) return new Date(numeric * 1000).toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

function findPhoneAnywhere(
  body: ChatwootWebhookBody,
  direction: 'inbound' | 'outbound'
): string {
  // En WhatsApp el telefono vive en el contacto de la conversacion. No se
  // busca con regex sobre todo el JSON: un id de mensaje tambien es numerico.
  // En un mensaje saliente el remitente es el agente; el telefono del cliente
  // esta en conversation.meta.sender o en conversation.contact.
  if (direction === 'outbound') {
    return firstNonEmpty(
      body.conversation?.meta?.sender?.phone_number,
      body.conversation?.contact?.phone_number,
      body.contact?.phone_number,
      body.sender?.phone_number
    )
  }
  return firstNonEmpty(
    body.sender?.phone_number,
    body.contact?.phone_number,
    body.conversation?.meta?.sender?.phone_number,
    body.conversation?.contact?.phone_number
  )
}

export interface ChatwootIngestResult {
  events: NormalizedEvent[]
  /** Cambios de estado (resuelta, reasignada). */
  conversationEvents: { conversationId: string; status: string | null; assignee: string | null }[]
}

export function parseChatwootWebhook(body: ChatwootWebhookBody): ChatwootIngestResult {
  const events: NormalizedEvent[] = []
  const conversationEvents: ChatwootIngestResult['conversationEvents'] = []

  if (!body.event) return { events, conversationEvents }

  if (
    body.event === 'conversation_status_changed' ||
    body.event === 'conversation_created' ||
    body.event === 'conversation_updated'
  ) {
    conversationEvents.push({
      conversationId: firstNonEmpty(
        String(body.conversation?.id ?? ''),
        String(body.conversation?.display_id ?? '')
      ),
      status: body.conversation?.status ?? body.status ?? null,
      assignee: body.conversation?.meta?.assignee?.name ?? null,
    })
  }

  if (body.event !== 'message_created' || body.private) {
    return { events, conversationEvents }
  }

  const conversationId = firstNonEmpty(
    String(body.conversation?.id ?? ''),
    String(body.conversation?.display_id ?? '')
  )
  if (!conversationId) return { events, conversationEvents }

  const messageType = body.message_type ?? 'incoming'
  const direction = messageType === 'incoming' ? 'inbound' : 'outbound'
  const phone = findPhoneAnywhere(body, direction)
  if (!phone) {
    console.warn(`[chatwoot] conversacion ${conversationId} sin telefono: evento ignorado`)
    return { events, conversationEvents }
  }

  // En un mensaje entrante el remitente es el contacto; en uno saliente, el agente.
  const assignee =
    direction === 'outbound'
      ? firstNonEmpty(body.sender?.name) || null
      : (body.conversation?.meta?.assignee?.name ?? null)

  events.push({
    source: 'chatwoot',
    eventId: `cw:${conversationId}:${body.id ?? ''}:${body.created_at ?? ''}`,
    threadKey: `chatwoot:${conversationId}`,
    channelConversationId: conversationId,
    phone,
    direction,
    assignee,
    content: body.content ?? null,
    timestamp: toIsoTimestamp(body.created_at),
    messageType: body.content_type ?? messageType,
    raw: body,
  })

  return { events, conversationEvents }
}
