// Conector de CRM.
//   mock      -> no sale a la red (default)
//   rdstation -> usa la API real

import { maskPhone, safeText } from '../middleware/anonymizer'

export interface LeadPayload {
  phone: string
  email: string | null
  name: string
  message: string
  classification: {
    priority: string
    intent: string
    confidence: number
    summary: string
  }
}

export interface AuditTaskPayload {
  phone: string
  email: string | null
  kind: string
  severity: string
  description: string
  priority: string | null
}

export interface PushResult {
  ok: boolean
  mocked: boolean
  detail: string
}

export interface CrmConnector {
  readonly name: string
  pushLead(lead: LeadPayload): Promise<PushResult>
  pushAuditTask(task: AuditTaskPayload): Promise<PushResult>
}

const mockConnector: CrmConnector = {
  name: 'mock',
  async pushLead(lead) {
    console.log(
      '[crm:mock] lead omitido:',
      JSON.stringify({
        phone: maskPhone(lead.phone),
        priority: lead.classification.priority,
        message: safeText(lead.message),
      })
    )
    return { ok: true, mocked: true, detail: 'registrado, no enviado' }
  },
  async pushAuditTask(task) {
    console.log(
      '[crm:mock] tarea omitida:',
      JSON.stringify({
        phone: maskPhone(task.phone),
        kind: task.kind,
        severity: task.severity,
      })
    )
    return { ok: true, mocked: true, detail: 'registrado, no enviado' }
  },
}

const RD_BASE = 'https://api.rd.services/platform'

async function rdFetch(token: string, path: string, init: RequestInit) {
  const response = await fetch(RD_BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok) {
    throw new Error('RD Station ' + response.status + ' en ' + path + ': ' + (await response.text()))
  }
  return response.status === 204 ? null : ((await response.json()) as Record<string, unknown>)
}

function extractId(response: Record<string, unknown> | null): number | string | null {
  if (!response) return null
  if (typeof response.id === 'number' || typeof response.id === 'string') return response.id
  const contacts = response.contacts
  if (Array.isArray(contacts) && contacts.length > 0) {
    const first = contacts[0] as Record<string, unknown>
    if (typeof first.id === 'number' || typeof first.id === 'string') return first.id
  }
  return null
}

function rdStationConnector(token: string): CrmConnector {
  return {
    name: 'rdstation',

    async pushLead(lead) {
      // RD Station exige email para crear un contacto; si no viene, se deriva
      // del telefono.
      const email = lead.email ?? lead.phone.replace(/\D/g, '') + '@sin-email.local'

      try {
        const contact = await rdFetch(token, '/contacts', {
          method: 'POST',
          body: JSON.stringify({
            contacts: [
              {
                email,
                name: lead.name || lead.phone,
                mobile_phone: lead.phone,
                legal_bases: [{ category: 'communications', status: 'granted' }],
              },
            ],
          }),
        })

        const contactId = extractId(contact)
        if (!contactId) {
          return { ok: false, mocked: false, detail: 'contacto creado pero sin id utilizable' }
        }

        const note = [
          'Clasificacion automatica: ' + lead.classification.priority +
            ' (confianza ' + lead.classification.confidence + ')',
          'Intencion: ' + lead.classification.intent,
          lead.classification.summary ? 'Resumen: ' + lead.classification.summary : null,
          '',
          'Mensaje: ' + lead.message,
        ]
          .filter(Boolean)
          .join('\n')

        await rdFetch(token, '/notes', {
          method: 'POST',
          body: JSON.stringify({ entity: 'contact', entity_id: contactId, body: note }),
        })

        return { ok: true, mocked: false, detail: 'contacto ' + String(contactId) + ' + nota' }
      } catch (error) {
        const detail = safeText(error instanceof Error ? error.message : String(error))
        console.error('[crm:rdstation] pushLead fallo:', detail)
        return { ok: false, mocked: false, detail }
      }
    },

    async pushAuditTask(task) {
      try {
        const email = task.email ?? task.phone.replace(/\D/g, '') + '@sin-email.local'
        const contact = await rdFetch(token, '/contacts', {
          method: 'POST',
          body: JSON.stringify({
            contacts: [
              {
                email,
                mobile_phone: task.phone,
                legal_bases: [{ category: 'communications', status: 'granted' }],
              },
            ],
          }),
        })

        const contactId = extractId(contact)
        if (!contactId) {
          return { ok: false, mocked: false, detail: 'sin id de contacto' }
        }

        const body = [
          '[AUDITORIA] ' + task.kind.toUpperCase() + ' - severidad ' + task.severity,
          task.priority ? 'Prioridad: ' + task.priority : null,
          '',
          task.description,
        ]
          .filter(Boolean)
          .join('\n')

        await rdFetch(token, '/notes', {
          method: 'POST',
          body: JSON.stringify({ entity: 'contact', entity_id: contactId, body }),
        })

        return { ok: true, mocked: false, detail: 'nota en contacto ' + String(contactId) }
      } catch (error) {
        const detail = safeText(error instanceof Error ? error.message : String(error))
        console.error('[crm:rdstation] pushAuditTask fallo:', detail)
        return { ok: false, mocked: false, detail }
      }
    },
  }
}

export interface CrmEnv {
  CRM_PROVIDER?: string
  RD_STATION_TOKEN?: string
}

export function getCrmConnector(env: CrmEnv): CrmConnector {
  const provider = (env.CRM_PROVIDER ?? 'mock').toLowerCase()
  const token = (env.RD_STATION_TOKEN ?? '').trim()

  if (provider === 'rdstation' && token && token.toLowerCase() !== 'mock') {
    return rdStationConnector(token)
  }
  if (provider === 'rdstation') {
    console.warn('[crm] CRM_PROVIDER=rdstation pero el token falta o es "mock": uso mock.')
  }
  return mockConnector
}
