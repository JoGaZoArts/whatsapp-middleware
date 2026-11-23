// Servidor estatico minimo para revisar los documentos HTML en el navegador.
//   npx tsx tools/servir-docs.ts [puerto]
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'

const RAIZ = 'docs'
const PUERTO = Number(process.argv[2] ?? 8099)

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}

createServer(async (req, res) => {
  try {
    let ruta = decodeURIComponent((req.url ?? '/').split('?')[0])
    if (ruta === '/') ruta = '/guion-demo.html'
    // normalize evita salir de la carpeta docs
    const destino = join(RAIZ, normalize(ruta).replace(/^(\.\.[/\\])+/, ''))
    const info = await stat(destino)
    if (!info.isFile()) throw new Error('no es archivo')
    const cuerpo = await readFile(destino)
    res.writeHead(200, { 'Content-Type': TIPOS[extname(destino)] ?? 'application/octet-stream' })
    res.end(cuerpo)
    console.log('200 ' + ruta)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('no encontrado')
    console.log('404 ' + (req.url ?? ''))
  }
}).listen(PUERTO, '127.0.0.1', () => {
  console.log('documentos en http://127.0.0.1:' + PUERTO)
})