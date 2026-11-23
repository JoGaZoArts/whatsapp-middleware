from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

doc = Document()

# Estilos base
style = doc.styles['Normal']
style.font.name = 'Calibri'
style.font.size = Pt(11)
style.paragraph_format.space_after = Pt(6)
style.paragraph_format.line_spacing = 1.15

def add_heading(text, level=1):
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        run.font.color.rgb = RGBColor(0x1e, 0x3a, 0x8a)
    return h

def add_paragraph(text, bold=False, italic=False, size=None, space_after=6):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    run = p.add_run(text)
    run.bold = bold
    run.italic = italic
    if size:
        run.font.size = Pt(size)
    return p

def add_bullet(text, level=0):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.left_indent = Inches(0.25 + level * 0.25)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run(text)
    return p

def add_table(headers, rows, widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr_cells = table.rows[0].cells
    for i, h in enumerate(headers):
        hdr_cells[i].text = ''
        run = hdr_cells[i].paragraphs[0].add_run(h)
        run.bold = True
        run.font.size = Pt(10)
        shading = OxmlElement('w:shd')
        shading.set(qn('w:val'), 'clear')
        shading.set(qn('w:color'), 'auto')
        shading.set(qn('w:fill'), 'D9E2F3')
        hdr_cells[i]._tc.get_or_add_tcPr().append(shading)
    for row in rows:
        cells = table.add_row().cells
        for i, val in enumerate(row):
            cells[i].text = ''
            run = cells[i].paragraphs[0].add_run(str(val))
            run.font.size = Pt(10)
    if widths:
        for i, w in enumerate(widths):
            for row in table.rows:
                row.cells[i].width = Inches(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return table

# Titulo
title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = title.add_run('INFORME FINAL DE PRÁCTICAS PROFESIONALES')
run.bold = True
run.font.size = Pt(16)
run.font.color.rgb = RGBColor(0x0f, 0x17, 0x2a)

sub = doc.add_paragraph()
sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = sub.add_run('Programa de Estudios: Ingeniería Informática')
run.font.size = Pt(11)
run.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

autor = doc.add_paragraph()
autor.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = autor.add_run('Juan Diego Ladino Ramírez — ITACA SOLUCIONES SAS')
run.font.size = Pt(10)
run.font.color.rgb = RGBColor(0x64, 0x74, 0x8b)

# Datos del alumno
add_heading('Datos del alumno', level=1)
add_table(
    ['Campo', 'Valor'],
    [
        ['Apellidos', 'Ladino Ramírez'],
        ['Nombre', 'Juan Diego'],
        ['Correo electrónico', 'juanladinoxp@gmail.com'],
        ['Cédula', '1020820609'],
        ['Teléfono 1', '3133766995'],
        ['Teléfono 2', ''],
    ],
    widths=[2, 4]
)

# Datos del centro
add_heading('Datos del centro y el período de prácticas', level=1)
add_table(
    ['Campo', 'Valor'],
    [
        ['Centro de prácticas', 'ITACA SOLUCIONES SAS'],
        ['Dirección', 'Av. Carrera 72 # 49-29, Bogotá'],
        ['Municipio', 'Bogotá'],
        ['Tutor en el centro', 'Tatiana Fique (Tfique@itacasoluciones.com, 57-3009570727)'],
        ['Tutor académico', 'Rafael Neftalí Lizcano Reyes'],
        ['Período', 'Septiembre 2026 — Noviembre 2026'],
        ['Total horas realizadas', 'Según cronograma de actividades'],
    ],
    widths=[2, 4]
)

# 1. Introducción
add_heading('1. Introducción', level=1)
add_paragraph(
    'El presente informe documenta el desarrollo de un sistema de integración para ITACA SOLUCIONES SAS, '
    'una empresa con un equipo comercial de tres agentes que opera conversaciones de venta a través de '
    'WhatsApp. El sistema recibe los mensajes entrantes, anonimiza la información personal que contienen, '
    'los clasifica mediante un modelo de inteligencia artificial, los almacena en una base de datos '
    'relacional y detecta los casos en que un cliente no ha recibido respuesta dentro de un tiempo '
    'establecido, generando una tarea de seguimiento.'
)
add_paragraph(
    'El trabajo se realizó en cuatro etapas: construcción de un prototipo, migración a infraestructura '
    'de servicios en la nube, evaluación de las alternativas de conexión y, finalmente, consolidación '
    'y verificación del sistema. Como resultado, el flujo completo se encuentra operando sobre una '
    'línea de prueba y cuenta con una batería de setenta y cuatro pruebas automatizadas que validan '
    'su comportamiento. Adicionalmente, se desarrolló un mockup en video que demuestra el concepto '
    'completo antes de contar con todos los recursos de producción.'
)
add_paragraph(
    'La motivación personal radica en la posibilidad de aplicar conocimientos de ingeniería informática '
    'a un problema real de la empresa: la falta de supervisión y clasificación automática de las '
    'conversaciones comerciales que se realizan por WhatsApp, con el consecuente riesgo de leads '
    'desatendidos y tiempos de respuesta no medidos.'
)

# 2. Contextualización
add_heading('2. Contextualización', level=1)

add_heading('2.1 Descripción del centro de prácticas y su entorno', level=2)
add_paragraph(
    'ITACA SOLUCIONES SAS es una empresa ubicada en Bogotá (Av. Carrera 72 # 49-29) que opera en el '
    'sector de soluciones tecnológicas. El área de sistemas, donde se realizaron las prácticas, cuenta '
    'con un equipo reducido de profesionales. La empresa atiende a clientes a través de conversaciones '
    'de venta por WhatsApp, operadas por tres agentes comerciales que utilizan la aplicación nativa '
    'en sus teléfonos personales.'
)

add_heading('2.2 Breve análisis del proyecto y/o actividades realizadas', level=2)
add_paragraph(
    'El proyecto consistió en evaluar y desarrollar una solución de conexión con WhatsApp Business '
    '(Cloud API de Meta) que sirviera de base para integrar la comunicación de la empresa con sus '
    'sistemas internos. Se evaluaron tres vías técnicas: la lectura de la aplicación de WhatsApp '
    'en los teléfonos de los agentes mediante código QR, la tercerización de la mensajería a un '
    'intermediario, y la interfaz oficial de empresa con una aplicación de atención propia.'
)
add_paragraph(
    'Las dos primeras se descartaron por el riesgo de bloqueo simultáneo de los tres números '
    'comerciales, con la correspondiente interrupción del servicio y pérdida del historial. Se '
    'optó por la tercera vía: la integración oficial de Meta con una interfaz propia para los '
    'agentes, que es la que se ha construido.'
)
add_paragraph(
    'Sobre esa vía se construyó un servicio propio (middleware) que recibe los mensajes entrantes, '
    'anonimiza la información personal antes de enviarla a un modelo de inteligencia artificial, '
    'clasifica cada mensaje según su intención comercial, registra todo en base de datos y detecta '
    'las conversaciones que llevan más tiempo del establecido sin recibir respuesta, generando '
    'una tarea de seguimiento.'
)

add_heading('2.3 Contextualización del departamento o área', level=2)
add_paragraph(
    'El área de sistemas de ITACA SOLUCIONES SAS cuenta con un equipo reducido de profesionales. '
    'La estructura es plana: el desarrollo se realizó de forma individual, con supervisión de la '
    'tutora del centro (Tatiana Fique) y del tutor académico (Rafael Neftalí Lizcano Reyes). '
    'Las tecnologías utilizadas (Cloudflare Workers, Hono, TypeScript, PostgreSQL en Neon, DeepSeek) '
    'se eligieron por similitud con las soluciones internas de la empresa, de modo que el '
    'comportamiento observado en las pruebas se pareciera al que se tendría en un entorno real.'
)

# 3. Realización de las prácticas
add_heading('3. Realización de las prácticas', level=1)
add_table(
    ['Campo', 'Valor'],
    [
        ['Fecha de entrada', 'Septiembre 2026'],
        ['Fecha de salida', 'Noviembre 2026'],
        ['Total horas realizadas', 'Según cronograma de actividades'],
    ],
    widths=[2, 4]
)

# 4. Desarrollo de las prácticas
add_heading('4. Desarrollo de las prácticas', level=1)

add_heading('4.1 Arquitectura sin servidor (serverless)', level=2)
add_paragraph(
    'El sistema se construyó como una aplicación de tipo middleware sobre Cloudflare Workers, '
    'un entorno de ejecución sin servidor. Esto significa que el código se ejecuta en el borde '
    'de la red de Cloudflare, se despierta solo cuando alguien lo invoca y no requiere un '
    'servidor propio ni mantenimiento de infraestructura. El framework Hono (TypeScript) gestiona '
    'las rutas y el enrutamiento.'
)
add_paragraph(
    'La arquitectura se organizó en torno a un evento normalizado: tanto la plataforma de '
    'mensajería (Meta) como la interfaz de atención (Chatwoot) producen el mismo evento interno. '
    'Esto permite que el núcleo del procesamiento sea idéntico sin importar de dónde llegue '
    'la conversación. Se escribió un adaptador por canal (meta.ts y chatwoot.ts), cada uno de '
    'los cuales convierte su formato propio al formato interno del sistema.'
)

add_heading('4.2 Modelo de datos en PostgreSQL serverless (Neon)', level=2)
add_paragraph('La base de datos se organizó en cuatro tablas:')
add_table(
    ['Tabla', 'Qué guarda'],
    [
        ['conversations', 'Estado de cada conversación: último mensaje, respuesta del agente, tiempos de SLA'],
        ['events', 'Bitácora de cada mensaje, con el texto original y el anonimizado'],
        ['tasks', 'Alertas y seguimientos generados (hot_lead, sla_breach, unattended)'],
        ['lead_logs', 'Mensajes con su clasificación de IA (prioridad, intención, confianza, resumen)'],
    ],
    widths=[1.5, 4.5]
)
add_paragraph(
    'El esquema tiene una restricción de unicidad sobre el identificador del evento. Eso es lo '
    'que evita los duplicados: no es una comprobación previa, es la base de datos la que rechaza '
    'el segundo registro. Esta decisión es más fiable que un control en memoria del proceso, '
    'porque persiste entre reinicios.'
)
add_paragraph(
    'El texto original y el anonimizado se guardan en columnas separadas (content_raw y '
    'content_redacted en events; message_raw y message_cleaned en lead_logs), lo que permite '
    'auditar qué se envió al modelo y qué se conservó internamente.'
)

add_heading('4.3 Diseño de la suite de pruebas automatizadas', level=2)
add_paragraph('Se construyó una batería de 74 pruebas automatizadas que cubren tanto la lógica de '
    'negocio como el comportamiento de los endpoints. Se organizan en cuatro suites:')
add_table(
    ['Suite', 'Pruebas', 'Qué comprueba'],
    [
        ['Horario laboral', '26', 'Días festivos, fines de semana, zonas horarias, calendario anual, minutos de espera'],
        ['Anonimización', '35', 'Cédulas, tarjetas, teléfonos y correos en varios formatos colombianos'],
        ['Endpoints', '9', 'Firma validada, webhook de Chatwoot exige secreto, administración y envío protegidos'],
        ['Tiempos de respuesta', '4', 'Detección de silencio, ausencia de falsos positivos, no duplicación de tareas'],
    ],
    widths=[1.5, 0.8, 3.7]
)
add_paragraph(
    'Las pruebas de SLA y de endpoints necesitan el servidor levantado; las otras dos no. Durante '
    'el desarrollo se detectaron situaciones que no se habrían identificado por observación directa '
    'y que fueron corregidas. La batería quedó incorporada al proyecto como mecanismo de control '
    'para las etapas siguientes.'
)

add_heading('4.4 Webhooks y endpoints integrados con la Cloud API de Meta', level=2)
add_paragraph(
    'Cada evento entrante se autentica antes de procesarse. La plataforma de mensajería firma cada '
    'petición con una clave compartida (App Secret) y el sistema verifica esa firma sobre el cuerpo '
    'crudo de la petición mediante HMAC-SHA256, comparada en tiempo constante. Las peticiones sin '
    'firma válida se rechazan antes de llegar al procesamiento.'
)
add_paragraph(
    'El control de duplicados se apoya en una restricción de unicidad en base de datos '
    '(event_id UNIQUE), que es atómica y persistente. Los endpoints de administración exigen '
    'una clave (x-admin-key), porque en producción el servicio queda con URL pública.'
)
add_paragraph(
    'Con la integración de Chatwoot, el flujo cambió: Meta entrega los mensajes a Chatwoot por la '
    'integración oficial de WhatsApp Cloud API, y Chatwoot envía sus eventos al Worker mediante un '
    'webhook con un secreto compartido (CHATWOOT_WEBHOOK_SECRET). El Worker valida ese secreto '
    'antes de procesar cada evento.'
)

add_heading('4.5 Anonimización de datos personales', level=2)
add_paragraph(
    'Ningún dato personal se envía a un modelo de terceros. El filtro cubre correo electrónico, '
    'tarjetas de crédito y de pago, teléfonos internacionales y locales, y documentos de '
    'identificación. Las reglas se aplican de la más larga a la más corta para evitar que un '
    'mismo valor sea fragmentado o etiquetado de forma incorrecta. Queda documentado el límite '
    'conocido: los nombres propios no se enmascaran, y los códigos internos de seis a nueve '
    'dígitos se sobre-enmascaran por seguridad. Es una decisión deliberada: es preferible '
    'ocultar de más que filtrar un dato sensible.'
)

add_heading('4.6 Auditoría de tiempos de respuesta (SLA)', level=2)
add_paragraph(
    'Es el núcleo funcional y tiene una limitación técnica que condiciona el diseño: un webhook '
    'solo se dispara ante eventos. Si un cliente escribe y nadie responde, no llega ninguna '
    'notificación, porque el silencio es por definición la ausencia de eventos. Por eso la '
    'detección necesita un proceso programado aparte, que se ejecuta cada quince minutos.'
)
add_paragraph(
    'El tiempo de espera se cuenta en horario de atención, no en tiempo de reloj: America/Bogotá, '
    'de lunes a viernes, con días festivos configurables. El umbral se establece en sesenta '
    'minutos como valor inicial y es ajustable mediante configuración.'
)

add_heading('4.7 Conector de CRM', level=2)
add_paragraph(
    'Se definió un contrato propio con dos operaciones: publicar un lead y publicar un hallazgo '
    'de auditoría. Hay una implementación simulada, que registra la carga sin enviar nada, y otra '
    'que se conectará a RD Station. La integración queda encapsulada: cuando se disponga del '
    'acceso, se implementan esas dos operaciones y se cambia una variable, sin tocar el resto '
    'del sistema.'
)

add_heading('4.8 Integración con Chatwoot', level=2)
add_paragraph(
    'La interfaz de atención de los agentes es Chatwoot autoalojado con la integración oficial '
    'de WhatsApp Cloud API. Chatwoot es el dueño del canal: recibe y envía los mensajes, gestiona '
    'la bandeja, la asignación, el historial, los contactos, las etiquetas y las notas. El Worker '
    'no reemplaza eso; lo extiende.'
)
add_paragraph(
    'Chatwoot usa el concepto de inboxes (bandejas). Cada número de WhatsApp se conecta como un '
    'inbox independiente dentro de la misma instancia. Los tres números conviven en el mismo '
    'panel. Chatwoot tiene auto-asignación por disponibilidad y reportes nativos (conversaciones, '
    'agentes, inboxes, etiquetas, equipos, CSAT).'
)
add_paragraph(
    'El flujo final es: Meta entrega el mensaje a Chatwoot por la integración oficial, Chatwoot '
    'lo recibe y envía un webhook al Worker con un secreto compartido, el Worker procesa '
    '(anonimiza, clasifica, mide SLA) y guarda en la base de datos. El agente responde desde '
    'Chatwoot y Chatwoot envía ese evento saliente al Worker, que calcula el tiempo de respuesta real.'
)

# 4.9 Prueba en vivo con Meta (conexión de prueba)
add_heading('4.9 Prueba en vivo con Meta (conexión de prueba)', level=2)
add_paragraph(
    'Como actividad complementaria y de validación, se realizó una conexión de prueba con la '
    'Cloud API de Meta utilizando un número de WhatsApp personal registrado ante la plataforma. '
    'Esta prueba permitió validar el flujo completo de extremo a extremo en un entorno real: '
    'recepción de mensajes desde WhatsApp, entrega a Chatwoot por la integración oficial, envío '
    'de webhooks al Worker con secreto compartido, anonimización, clasificación con IA, medición '
    'de SLA y registro en base de datos.'
)
add_paragraph(
    'La conexión se realizó mediante túneles de Cloudflare (cloudflared), que expusieron '
    'Chatwoot y el Worker a internet con URLs HTTPS temporales, permitiendo que Meta enviara '
    'los webhooks de WhatsApp a la instancia local. Se verificó que los mensajes entrantes se '
    'procesaran correctamente, que la anonimización enmascarara los datos personales, que la '
    'clasificación de IA asignara prioridad e intención, y que las tareas de seguimiento se '
    'crearan automáticamente para los leads calientes.'
)
add_paragraph(
    'Se tomaron capturas de pantalla del funcionamiento completo: la bandeja de Chatwoot con '
    'las conversaciones, los logs del Worker mostrando la anonimización y clasificación en tiempo '
    'real, y las tablas de la base de datos con los datos guardados (conversaciones, eventos '
    'anonimizados, clasificaciones de IA y tareas generadas).'
)
add_paragraph('[Insertar capturas aquí: bandeja de Chatwoot con conversación de WhatsApp real, '
    'logs del Worker mostrando anonimización y clasificación, tablas de NeonDB con los datos '
    'guardados, y la vista visual de la demostración.]', italic=True)

# 4.10 Montaje de prueba con Docker Compose
add_heading('4.10 Montaje de prueba con Docker Compose', level=2)
add_paragraph(
    'Chatwoot se instaló y configuró en un entorno local utilizando Docker Desktop con WSL2. '
    'Se levantó la instancia completa (aplicación Rails, base de datos PostgreSQL, Redis y '
    'Sidekiq) mediante Docker Compose, con un solo comando. Se configuró el archivo de entorno '
    '(.env) con las credenciales necesarias y se preparó la base de datos con la migración inicial.'
)
add_paragraph(
    'Este montaje de prueba permitió validar la integración Chatwoot-Worker sin necesidad de '
    'un servidor Linux ni de un dominio con certificado SSL. El túnel de Cloudflare expuso la '
    'instancia local a internet, lo que hizo posible la conexión con Meta para la recepción '
    'de mensajes reales de WhatsApp.'
)
add_paragraph(
    'El entorno de prueba es idéntico al que se usaría en producción: el mismo Docker Compose, '
    'las mismas variables de entorno y la misma configuración. La única diferencia es el entorno '
    'donde corre (PC local versus servidor Linux) y la URL pública (túnel temporal versus dominio '
    'propio con certificado).'
)

# 4.11 Hallazgo: comportamiento de imágenes compartidas en Chatwoot
add_heading('4.11 Hallazgo: comportamiento de imágenes compartidas en Chatwoot', level=2)
add_paragraph(
    'Durante las pruebas se observó un comportamiento particular con las imágenes compartidas '
    'en las conversaciones: las imágenes recibidas se salen del aspecto normal del mensaje dentro '
    'del chat de Chatwoot y no se visualizan correctamente en la aplicación móvil. Este '
    'comportamiento parece ser una limitación de la versión de Chatwoot utilizada, no un defecto '
    'del Worker.'
)
add_paragraph(
    'Este hallazgo se documenta como una observación técnica, no como una falla del sistema '
    'desarrollado. Chatwoot es un proyecto de código abierto con su propio ciclo de desarrollo; '
    'corregir este comportamiento implicaría contribuir al repositorio oficial de Chatwoot, lo '
    'cual no forma parte del alcance de esta práctica. En el contexto de la empresa, si se '
    'requiere que las imágenes se visualicen correctamente, se puede evaluar como un proyecto '
    'interno separado o como una contribución al proyecto de código abierto.'
)
add_paragraph(
    'Es importante señalar que este comportamiento no afecta la funcionalidad del Worker: '
    'los mensajes de texto se procesan, anonimizan y clasifican correctamente, y las imágenes '
    'no contienen datos que requieran anonimización para la IA (el anonimizador opera sobre texto).'
)

# 5. Seguimiento al cronograma
add_heading('5. Seguimiento al cronograma de actividades', level=1)
add_table(
    ['Actividad', 'Estado'],
    [
        ['Revisión inicial del proyecto y definición del alcance con el área de sistemas', 'Completada'],
        ['Prototipo de la conexión con WhatsApp Business (Cloud API de Meta)', 'Completada'],
        ['Migración del servicio a la infraestructura corporativa (Cloudflare Workers + Neon)', 'Completada'],
        ['Construcción del servicio (recepción, anonimización, clasificación, auditoría) y verificación mediante pruebas automatizadas', 'Completada'],
        ['Evaluación de la interfaz de atención para agentes (Chatwoot autoalojado)', 'Completada (arquitectura confirmada, instalación pendiente)'],
        ['Integración definitiva con el sistema de gestión comercial (RD Station)', 'Pendiente (diferido por decisión de la empresa)'],
        ['Validación en entorno productivo', 'Pendiente (depende de la empresa)'],
    ],
    widths=[4.5, 1.5]
)

# 6. Comentarios y observaciones adicionales
add_heading('6. Comentarios y observaciones adicionales', level=1)
add_paragraph(
    'El proyecto avanza conforme a lo previsto. El ritmo de trabajo se ha mantenido dentro de las '
    'actividades acordadas, y el desarrollo se encuentra actualmente en la etapa de verificación '
    'e integración con Chatwoot.'
)
add_paragraph(
    'Se observa que las tareas de carácter técnico se resolvieron en su totalidad, mientras que '
    'los puntos que dependen de la empresa (habilitación de la cuenta en la plataforma de Meta, '
    'definición de la interfaz de atención para los agentes, conexión con RD Station) siguen en '
    'espera.'
)
add_paragraph(
    'Como ampliación al alcance original se desarrolló un reporte de costos que compara los planes '
    'de Chatwoot en la nube versus la opción autoalojada, y se añadió la anonimización de datos '
    'personales como medida de seguridad, aunque no fue un requisito del cliente.'
)
add_paragraph(
    'Se realizaron pruebas fehacientes del funcionamiento completo de la integración con Meta y '
    'Chatwoot, con capturas de pantalla del flujo completo: recepción de mensajes, anonimización, '
    'clasificación, creación de tareas y registro en base de datos. Aunque no fue posible realizar '
    'una reunión formal con el área de Marketing para validar en conjunto, el material de evidencia '
    'permite demostrar el funcionamiento del sistema.'
)
add_paragraph(
    'Se identificó un conflicto de fechas y comunicación directa: la comunicación se realizó a '
    'través de un filtro compartido y no de forma directa con el área de Marketing, que es el '
    'receptor final de la solución. Esto dificultó la validación conjunta y la definición de '
    'los requisitos finales.'
)
add_paragraph(
    'Como propuesta para la entrega final a la empresa, se considera crear un repositorio de '
    'código fuente (Git) que permita validar y tener una entrega real, no solo capturas de pruebas '
    'de concepto. El código está documentado para que sea sencillo integrar por parte de la empresa '
    'los recursos que requiera (Meta, Neon, IA), y la memoria del proyecto (documentación HTML) '
    'permite conectar otras fuentes que no sean las actuales.'
)
add_paragraph('No se identifican factores que impidan la entrega.')

# 7. Bibliografía
add_heading('7. Bibliografía', level=1)
add_bullet('Meta Platforms, Inc. (2026). WhatsApp Cloud API Documentation. https://developers.facebook.com/docs/whatsapp/cloud-api')
add_bullet('Chatwoot. (2026). Chatwoot Documentation. https://www.chatwoot.com/docs')
add_bullet('Cloudflare. (2026). Workers Documentation. https://developers.cloudflare.com/workers/')
add_bullet('Hono. (2026). Hono Documentation. https://hono.dev/')
add_bullet('Neon. (2026). Neon Serverless PostgreSQL. https://neon.tech/docs')
add_bullet('DeepSeek. (2026). DeepSeek API Documentation. https://platform.deepseek.com/docs')

# 8. Autoevaluación de competencias generales
add_heading('8. Autoevaluación de competencias generales', level=1)
add_paragraph('El estudiante evalúa su actuación y nivel de compromiso durante el período de prácticas '
    'según una escala del 1 al 10:')
add_table(
    ['Competencia', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    [
        ['Puntualidad', '', '', '', '', '', '', '', '', '', 'X'],
        ['Responsabilidad', '', '', '', '', '', '', '', '', '', 'X'],
        ['Dedicación', '', '', '', '', '', '', '', '', '', 'X'],
        ['Motivación por el trabajo', '', '', '', '', '', '', '', '', '', 'X'],
    ],
    widths=[2.5, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4]
)

# 9. Autoevaluación de cumplimiento de objetivos
add_heading('9. Autoevaluación de cumplimiento de objetivos', level=1)
add_paragraph('Evaluación del grado de consecución de los objetivos del proyecto de prácticas:')
add_table(
    ['Objetivo', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    [
        ['Evaluar y desarrollar una solución de conexión con WhatsApp Business (Cloud API de Meta)', '', '', '', '', '', '', '', '', '', 'X'],
        ['Implementar recepción autenticada de mensajes con validación de firma', '', '', '', '', '', '', '', '', '', 'X'],
        ['Implementar anonimización de datos personales antes de la IA', '', '', '', '', '', '', '', '', '', 'X'],
        ['Implementar clasificación de intenciones comerciales con IA', '', '', '', '', '', '', '', '', '', 'X'],
        ['Implementar auditoría de tiempos de respuesta con SLA', '', '', '', '', '', '', '', '', '', 'X'],
        ['Verificar el funcionamiento mediante pruebas automatizadas', '', '', '', '', '', '', '', '', '', 'X'],
        ['Integrar con Chatwoot para la atención de agentes', '', '', '', '', '', '', '', '', '', 'X'],
        ['Desarrollar mockup en video de la demostración completa', '', '', '', '', '', '', '', '', '', 'X'],
    ],
    widths=[4.0, 0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.35]
)

# 10. Auto calificación global
add_heading('10. Auto calificación global', level=1)
add_paragraph('Auto calificación global (sobre 10): 10')

# 11. Observaciones
add_heading('11. Observaciones', level=1)
add_paragraph(
    'El desarrollo permitió confirmar que la integración propuesta es técnicamente viable, pero '
    'también puso de manifiesto que la decisión crítica no es solo técnica. El principal '
    'aprendizaje se relaciona con la seguridad operacional: la lectura no oficial de la '
    'aplicación de mensajería habría parecido la solución más sencilla, pero habría expuesto '
    'a las tres líneas comerciales de forma simultánea. La evaluación del riesgo resultó determinante.'
)
add_paragraph(
    'Otro aprendizaje se refiere a la arquitectura. El diseño modular permitió mantener el '
    'sistema independiente de la plataforma de atención que finalmente se utilice, y puso en '
    'evidencia una limitación poco evidente: la imposibilidad de detectar la ausencia de '
    'eventos mediante el propio mecanismo de eventos. Esta limitación motivó un diseño basado '
    'en un proceso programado, en lugar de una solución que a primera vista parecía más simple '
    'pero no funcionaría.'
)
add_paragraph(
    'Finalmente, el trabajo destaca la importancia de la verificación automatizada. Durante '
    'el proceso de prueba se detectaron situaciones que no se habrían identificado por '
    'observación directa, y que fueron corregidas. La batería de pruebas quedó incorporada al '
    'proyecto como mecanismo de control para las etapas siguientes.'
)
add_paragraph(
    'En cuanto al componente de ingeniería informática, el proyecto profundiza en: arquitectura '
    'sin servidor (Cloudflare Workers con Hono en TypeScript), modelo de datos en PostgreSQL '
    'serverless (Neon) con cuatro tablas y restricción de unicidad para deduplicación, diseño '
    'de la suite de pruebas automatizadas (74 pruebas en cuatro suites), y webhooks y endpoints '
    'integrados con la Cloud API de Meta (firma HMAC-SHA256, secreto compartido con Chatwoot, '
    'control de acceso por clave de administración).'
)

# 12. Firmas
add_heading('12. Firmas', level=1)
add_table(
    ['Firma del estudiante', 'Firma tutor de centro (Profesional)', 'Firma docente de prácticas (Tutor académico)'],
    [
        ['', '', ''],
    ],
    widths=[2, 2, 2]
)

# Pie
pie = doc.add_paragraph()
pie.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = pie.add_run('Informe final de prácticas profesionales — Juan Diego Ladino Ramírez — ITACA SOLUCIONES SAS — Noviembre 2026.')
run.font.size = Pt(9)
run.font.color.rgb = RGBColor(0x64, 0x74, 0x8b)

pie2 = doc.add_paragraph()
pie2.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = pie2.add_run('Repositorio del código: github.com/JoGaZoArts/whatsapp-middleware (README con instrucciones de instalación y ejecución).')
run.font.size = Pt(9)
run.font.color.rgb = RGBColor(0x64, 0x74, 0x8b)

doc.save('C:\\whatsapp-middleware\\docs\\INFORME-FINAL.docx')
print('Documento guardado: INFORME-FINAL.docx')
print('Secciones: 12')
print('Tablas: ' + str(len(doc.tables)))