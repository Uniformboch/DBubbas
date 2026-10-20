// Servidor de prueba: solo escucha en esta computadora (127.0.0.1), no en la red.
// Usa el mismo código del servidor que Netlify, con los datos en .datos-locales/.
// Uso: node scripts/servidor-local.mjs [puerto]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../servidor/api.mjs';
import { almacenDisco } from '../servidor/almacen-disco.mjs';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const PUBLICO = join(raiz, 'public');
const DATOS = join(raiz, 'data');
const LOCALES = join(raiz, '.datos-locales');
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

/** Variables de .env.local (contraseña de prueba local; el archivo no se sube a git). */
function leerEntorno() {
  const archivo = join(raiz, '.env.local');
  const entorno = {};
  if (!existsSync(archivo)) return entorno;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(linea);
    if (m) entorno[m[1]] = m[2];
  }
  return entorno;
}

const leerJSON = (f) => JSON.parse(readFileSync(join(DATOS, f), 'utf8'));
const entorno = leerEntorno();
const servidor = crearServidor({
  almacenes: {
    estado: almacenDisco(join(LOCALES, 'menu-estado')),
    fotos: almacenDisco(join(LOCALES, 'menu-fotos')),
    respaldos: almacenDisco(join(LOCALES, 'menu-respaldos')),
    intentos: almacenDisco(join(LOCALES, 'menu-intentos')),
  },
  entorno: { ADMIN_PASSWORD_HASH: entorno.ADMIN_PASSWORD_HASH, SESSION_SECRET: entorno.SESSION_SECRET },
  inicial: { menu: leerJSON('menu.json'), temporada: leerJSON('menu-temporada.json') },
});

const esDinamica = (ruta) => ruta.startsWith('/api/') || ruta === '/menu.json' || ruta === '/menu-temporada.json' || ruta.startsWith('/fotos/');

/** Pasa la solicitud de Node al servidor (formato Request/Response, como en Netlify). */
async function atenderDinamica(req, res, pathname) {
  const trozos = [];
  for await (const t of req) trozos.push(t);
  const cuerpo = Buffer.concat(trozos);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  const request = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) || !cuerpo.length ? undefined : cuerpo,
  });
  const respuesta = pathname.startsWith('/api/')
    ? await servidor.api(request, { ip: req.socket.remoteAddress })
    : await servidor.datos(request);
  const salida = {};
  respuesta.headers.forEach((v, k) => { if (k !== 'set-cookie') salida[k] = v; });
  const cookies = respuesta.headers.getSetCookie();
  if (cookies.length) salida['set-cookie'] = cookies;
  res.writeHead(respuesta.status, salida);
  res.end(Buffer.from(await respuesta.arrayBuffer()));
}

async function archivo(res, ruta, extra = {}) {
  const cuerpo = await readFile(ruta);
  res.writeHead(200, { ...ENCABEZADOS, 'Content-Type': TIPOS[extname(ruta)] || 'application/octet-stream', ...extra });
  res.end(cuerpo);
}

function noEncontrado(res) {
  res.writeHead(404, { ...ENCABEZADOS, 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('No encontrado');
}

const http = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (esDinamica(pathname)) return await atenderDinamica(req, res, pathname);

    req.resume(); // descarta cualquier cuerpo para que Windows no corte la conexión
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, ENCABEZADOS);
      return res.end();
    }
    if (pathname === '/panel') {
      res.writeHead(301, { Location: '/panel/' });
      return res.end();
    }
    let relativa = decodeURIComponent(pathname);
    if (relativa.endsWith('/')) relativa += 'index.html';
    const ruta = normalize(join(PUBLICO, relativa));
    if (!ruta.startsWith(PUBLICO + sep)) return noEncontrado(res);
    const info = await stat(ruta).catch(() => null);
    if (!info || !info.isFile()) return noEncontrado(res);
    const extra = pathname.startsWith('/panel/')
      ? { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
      : { 'Cache-Control': 'no-cache' };
    return await archivo(res, ruta, extra);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, ENCABEZADOS);
    res.end('Error');
  }
});

http.listen(PUERTO, '127.0.0.1', () => {
  console.log(`Menú en http://localhost:${PUERTO}/  ·  Panel en http://localhost:${PUERTO}/panel/`);
  if (!entorno.ADMIN_PASSWORD_HASH) console.log('Sin .env.local: corre "node scripts/preparar-local.mjs" para tener contraseña de prueba.');
});
