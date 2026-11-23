<div align="center">

# WhatsApp Business Middleware

**Recepción autenticada, anonimización, clasificación con IA y control de tiempos de respuesta para WhatsApp Business.**

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-E36002?style=flat-square)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Tests](https://img.shields.io/badge/tests-74_passing-2ea44f?style=flat-square)
![Chatwoot](https://img.shields.io/badge/Chatwoot-1F93FF?style=flat-square&logo=chatwoot&logoColor=white)
![DeepSeek](https://img.shields.io/badge/DeepSeek-4D6BFE?style=flat-square)

</div>

> Middleware que recibe los mensajes de WhatsApp de una empresa, anonimiza los datos personales, los clasifica con inteligencia artificial, mide el tiempo de respuesta en horario laboral y los conecta con el CRM. Todo corre sobre Cloudflare Workers (sin servidor propio) y PostgreSQL en Neon.

---

## En una mirada

| Parte | Archivos | Líneas | Qué aporta |
|---|---:|---:|---|
| **Sistema** | 9 | **1.396** | El servicio que se entrega |
| **Base de datos** | 2 | 125 | Esquema y migración |
| **Pruebas** | 5 | 763 | Verificación automatizada |
| **Herramientas** | 9 | 1.212 | Demo y documentos |
| **Total** | **25** | **3.496** | |

**Lo que se entrega son 1.521 líneas:** los 9 archivos de `src/` y los 2 de `db/`. Las pruebas y las herramientas son de apoyo.

---

## Arquitectura: Chatwoot autoalojado + Worker

Chatwoot es la bandeja de los agentes y el canal oficial con Meta. El Worker es la capa que lo extiende con IA, seguridad, SLA y CRM.

| Función | Chatwoot | Worker (capa adicional) |
|---|---|---|
| Canal de WhatsApp, mensajes, adjuntos, plantillas y estados | Sí, integración oficial con Meta | No |
| Bandeja, conversaciones, equipos, asignación e historial | Sí | No; solo guarda la referencia |
| Contactos, etiquetas, notas privadas y respuestas rápidas | Sí | Escribe atributos y nota (pendiente) |
| Clasificación con IA (DeepSeek) | No | Sí |
| Anonimización antes de la IA | No | Sí; medida de seguridad añadida |
| SLA con horario laboral y tareas | Reportes nativos; no la regla específica | Sí |
| CRM y base de auditoría del pipeline | Webhooks y API; no la lógica | Sí |

**Flujo:** Meta → Chatwoot (canal oficial) → Worker (webhook con secreto) → Procesamiento → CRM

---

## Qué hace el sistema

1. **Recepción autenticada** — valida la firma de Meta o el secreto de Chatwoot. Rechaza peticiones sin firma válida.
2. **Anonimización** — quita cédulas, tarjetas, teléfonos y correos antes de enviar cualquier texto a la IA. Guarda el original aparte.
3. **Clasificación con IA** — distingue venta nueva, soporte y gestión transaccional. Devuelve prioridad, intención, confianza y resumen.
4. **Persistencia** — historial de conversaciones, métricas por agente y registro de eventos en PostgreSQL serverless (Neon).
5. **Auditoría de tiempos de respuesta** — detecta conversaciones donde el cliente escribió y no se respondió, y genera tarea de seguimiento. Cuenta en horario laboral, no en tiempo de reloj.
6. **Conector de CRM** — interfaz preparada para publicar leads y hallazgos. Funciona en modo simulado mientras no se disponga del acceso.

---

## Mapa del repositorio

```
src/
├── index.ts        rutas, autenticación y orquestación
├── types.ts        contrato interno del mensaje
├── ingest/         meta.ts · chatwoot.ts (adaptadores por canal)
├── services/       ai.ts · db.ts · crm.ts
├── middleware/     anonymizer.ts
└── lib/            businesstime.ts
db/
├── schema.sql
└── migrate.ts
```

---

## Cómo se ejecuta

```sh
npm install        # una sola vez
npm run dev        # levanta el servicio en local
npm test           # 61 pruebas de lógica, sin servidor
npm run demo       # verificación completa
npm run typecheck  # verificación de tipos
npm run deploy     # publica en Cloudflare (necesita npx wrangler login)
```

---

## Configuración

Copia `.dev.vars.example` a `.dev.vars` y completa los valores:

```sh
cp .dev.vars.example .dev.vars
```

Variables principales:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | URL de conexión a PostgreSQL (Neon) |
| `DEEPSEEK_API_KEY` | Clave de la API de DeepSeek |
| `APP_SECRET` | Secreto para validar firma de Meta |
| `WEBHOOK_VERIFY_TOKEN` | Token de verificación del webhook de Meta |
| `ADMIN_KEY` | Clave de administración para endpoints protegidos |
| `CHATWOOT_WEBHOOK_SECRET` | Secreto compartido con Chatwoot |
| `PHONE_NUMBER_ID` | ID del número de WhatsApp (solo envío de prueba) |
| `WHATSAPP_ACCESS_TOKEN` | Token de acceso a la API de WhatsApp (solo envío de prueba) |

---

## Pruebas

74 pruebas automatizadas que pasan todas:

| Suite | Pruebas | Qué comprueba |
|---|---:|---|
| Horario laboral | 26 | Días festivos, fines de semana, zonas horarias, calendario anual |
| Anonimización | 35 | Cédulas, tarjetas, teléfonos y correos en varios formatos colombianos |
| Endpoints | 9 | Firma validada, webhook de Chatwoot exige secreto, admin y envío protegidos |
| Tiempos de respuesta | 4 | Detección de silencio, ausencia de falsos positivos, no duplicación |

---

## Seguridad

- **Tres llaves:** firma de Meta (entrada directa), secreto del webhook de Chatwoot y clave de administración. Si falta una, el endpoint protegido se apaga.
- **Logs enmascarados:** los teléfonos, correos, cédulas y tarjetas no aparecen en los logs del Worker.
- **Secretos:** viven en `.dev.vars` (local) o en la configuración de Cloudflare (producción), nunca en el repositorio.
- **Chatwoot autoalojado:** los datos de la conversación quedan en la instancia de la empresa, no en un SaaS de terceros.

---

## Licencia

MIT

---

<p align="center"><sub>Proyecto de práctica empresarial — Ingeniería Informática — ITACA SOLUCIONES SAS</sub></p>
