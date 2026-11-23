// El nucleo no sabe de donde viene un mensaje: ambos adaptadores producen el
// mismo NormalizedEvent. Ver src/ingest/.

export type ChannelSource = 'meta' | 'chatwoot'
export type Direction = 'inbound' | 'outbound'

export interface NormalizedEvent {
  source: ChannelSource
  /** Id unico del mensaje. Base del dedup contra events.event_id. */
  eventId: string
  /** Identifica el hilo. 'meta:+573...' cuando no hay Chatwoot. */
  threadKey: string
  channelConversationId: string | null
  /** Siempre en E.164, con '+'. */
  phone: string
  direction: Direction
  assignee: string | null
  /** Texto sin anonimizar. Puede contener PII: no enviar a terceros. */
  content: string | null
  timestamp: string
  messageType: string
  raw: unknown
}

export interface LeadClassification {
  priority: 'HOT' | 'WARM' | 'COLD'
  intent: string
  confidence: number
  summary: string
  /** false cuando la IA no respondio y el resto son valores por defecto. */
  aiAvailable: boolean
}

export interface SlaConfig {
  thresholdMinutes: number
  /** Hora de inicio de atencion en America/Bogota (0-23). */
  startHour: number
  endHour: number
  /** Festivos de Colombia, formato YYYY-MM-DD. */
  holidays: Set<string>
  /** Canales cuyo lado saliente se conoce. El resto queda fuera de la auditoria. */
  channels: Set<string>
  /** Tope de tareas por barrido. */
  maxPerRun: number
}
