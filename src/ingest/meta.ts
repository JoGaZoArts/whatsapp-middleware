import type { ChannelSource, NormalizedEvent } from '../types'

// Meta solo notifica mensajes entrantes y acuses de estado. No hay webhook de
// respuesta del agente; sin una interfaz de agentes el tiempo de respuesta no
// se puede medir con exactitud.

export interface MetaIngestResult {
  events: NormalizedEvent[]
  statuses: { id: string; status: string; to: string; timestamp: string }[]
}

function toE164(raw: string, defaultCountry: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith(defaultCountry) && digits.length > 11) return `+${digits}`
  return `+${defaultCountry}${digits}`
}

interface MetaMessage {
  id?: string
  from?: string
  type?: string
  timestamp?: string
  text?: { body?: string }
  interactive?: { type?: string; button_reply?: { title?: string } }
  button?: { text?: string }
}

interface MetaWebhookBody {
  object?: string
  entry?: {
    id?: string
    changes?: {
      field?: string
      value?: {
        messaging_product?: string
        metadata?: { display_phone_number?: string; phone_number_id?: string }
        contacts?: { profile?: { name?: string }; wa_id?: string }[]
        messages?: MetaMessage[]
        statuses?: {
          id?: string
          status?: string
          timestamp?: string
          recipient_id?: string
          errors?: unknown
        }[]
      }
    }[]
  }[]
}

function extractContent(message: MetaMessage | undefined): string | null {
  if (!message) return null
  if (message.text?.body) return message.text.body
  if (message.button?.text) return `[boton] ${message.button.text}`
  const reply = message.interactive?.button_reply?.title
  if (reply) return `[respuesta rapida] ${reply}`
  return null
}

export function parseMetaWebhook(
  body: MetaWebhookBody,
  defaultCountry: string
): MetaIngestResult {
  const events: NormalizedEvent[] = []
  const statuses: MetaIngestResult['statuses'] = []

  if (body.object !== 'whatsapp_business_account') return { events, statuses }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue
      const value = change.value ?? {}

      for (const status of value.statuses ?? []) {
        if (!status.id) continue
        statuses.push({
          id: status.id,
          status: status.status ?? 'unknown',
          to: status.recipient_id ?? '',
          timestamp: status.timestamp
            ? new Date(Number(status.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
        })
      }

      for (const message of value.messages ?? []) {
        if (!message.id || !message.from) continue
        const phone = toE164(message.from, defaultCountry)
        const content = extractContent(message)

        events.push({
          source: 'meta' satisfies ChannelSource,
          eventId: message.id,
          // Sin Chatwoot, el hilo se identifica por numero.
          threadKey: `meta:${phone}`,
          channelConversationId: null,
          phone,
          direction: 'inbound',
          assignee: null,
          content,
          timestamp: message.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
          messageType: message.type ?? 'unknown',
          raw: message,
        })
      }
    }
  }

  return { events, statuses }
}
