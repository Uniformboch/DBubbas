// Servidor de prueba: solo escucha en esta computadora (127.0.0.1), no en la red.
// Uso: node scripts/servidor-local.mjs [puerto]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const PUBLICO = join(raiz, 'public');
const DATOS = join(raiz, 'data');
const PUERTO = Number(process.argv[2] || process.env.PORT || 8888);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const ENCABEZADOS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

// Los JSON del menú no son archivos públicos: se sirven como lo hará la función `datos`.
const RUTAS_DATOS = { '/menu.json': 'menu.json', '/menu-temporada.json': 'menu-temporada.json' };

async function archivo(res, ruta, extra = {}) {
  const cuerpo = await readFile(ruta);
  res.writeHead(200, { ...ENCABEZADOS, 'Content-Type': TIPOS[extname(ruta)] || 'application/octet-stream', ...extra });
  res.end(cuerpo);
}

function noEncontrado(res) {
  res.writeHead(404, { ...ENCABEZADOS, 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('No encontrado');
}

const servidor = createServer(async (req, res) => {
  req.resume(); // descarta cualquier cuerpo para que Windows no corte la conexión
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, ENCABEZADOS);
      return res.end();
    }
    if (RUTAS_DATOS[pathname]) {
      return await archivo(res, join(DATOS, RUTAS_DATOS[pathname]), { 'Cache-Control': 'no-store' });
    }
    let relativa = decodeURIComponent(pathname);
    if (relativa.endsWith('/')) relativa += 'index.html';
    const ruta = normalize(join(PUBLICO, relativa));
    if (!ruta.startsWith(PUBLICO + sep)) return noEncontrado(res);
    const info = await stat(ruta).catch(() => null);
    if (!info || !info.isFile()) return noEncontrado(res);
    return await archivo(res, ruta, { 'Cache-Control': 'no-cache' });
  } catch (err) {
    console.error(err);
    res.writeHead(500, ENCABEZADOS);
    res.end('Error');
  }
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`Menú en http://localhost:${PUERTO}/`);
});
