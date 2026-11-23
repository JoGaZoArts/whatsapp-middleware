import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Extrae el texto visible de un HTML y escribe los caracteres no-ASCII
 * escapados.
 */
const origen = process.argv[2] ?? 'docs/informe-tecnico.html'
const destino = process.argv[3] ?? 'docs/_extract/texto-plano.txt'

let s = readFileSync(origen, 'utf8')

// Quitar estilos y scripts
s = s.replace(/<style>[\s\S]*?<\/style>/g, '')
s = s.replace(/<script>[\s\S]*?<\/script>/g, '')
// Cada salto y cierre de bloque produce una linea.
s = s.replace(/<br\s*\/?>/g, '\n')
s = s.replace(/<\/(p|div|li|h1|h2|h3|h4|tr)>/g, '\n')
s = s.replace(/<li[^>]*>/g, '- ')
// Quitar todo lo que queda como etiqueta
s = s.replace(/<[^>]+>/g, '')
// Decodificar entidades comunes
s = s
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&([a-zA-Z]+);/g, (m, n) => {
    const map: Record<string, string> = {
      oacute: 'ó', iacute: 'í', aacute: 'á', eacute: 'é', uacute: 'ú',
      ntilde: 'ñ', Ntilde: 'Ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í',
      Oacute: 'Ó', Uacute: 'Ú', ouml: 'ö', auml: 'ä', uuml: 'ü',
      deg: '°', middot: '·', bull: '•', rsquo: '’', lsquo: '‘',
      ldquo: '“', rdquo: '”', ndash: '–', mdash: '—',
    }
    return map[n] ?? m
  })

// Escapar todo lo no-ASCII para leerlo sin ambiguedad.
let salida = ''
for (const ch of s) {
  const cp = ch.codePointAt(0) ?? 0
  if (cp === 10) { salida += '\n'; continue }
  salida += cp > 126 ? '\\u' + cp.toString(16).toUpperCase().padStart(4, '0') : ch
}

const lineas = salida
  .split('\n')
  .map((l) => l.replace(/[ \t]+/g, ' ').trim())
  .filter((l) => l !== '')

writeFileSync(destino, lineas.join('\n'), 'utf8')
console.log('origen : ' + origen)
console.log('lineas : ' + lineas.length)
console.log('caracteres: ' + salida.length)
console.log('salida : ' + destino)
