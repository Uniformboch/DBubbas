// API del panel (/api/*) y datos públicos (/menu.json, /menu-temporada.json, /fotos/*).
// El almacenamiento se inyecta: Netlify Blobs en producción, almacén en memoria o en disco en pruebas.
import { randomBytes } from 'node:crypto';
import { validarEstado, fotosUsadas } from '../public/js/lib/validar-menu.mjs';
import {
  verificarContrasena, crearSesion, sesionValida, cookieSesion, cookieBorrar, leerCookie,
  claveIntentos, normalizarIntentos, segundosBloqueo, registrarFallo,
} from './seguridad.mjs';

export const CLAVE_ESTADO = 'actual';
export const MAXIMO_RESPALDOS = 60;
export const MAXIMO_FOTO = 4 * 1024 * 1024;
const MAXIMO_JSON = 1024 * 1024;

const SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

function json(estado, cuerpo, extra = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEGURIDAD, ...extra },
  });
}
const fallo = (estado, mensaje, extra = {}) => json(estado, { error: mensaje, ...extra });

/** Lee y descarta el cuerpo; si no se lee, Windows puede cortar la conexión antes de la respuesta. */
async function descartarCuerpo(request) {
  try { if (request.body && !request.bodyUsed) await request.arrayBuffer(); } catch { /* ya no importa */ }
}

async function leerJSON(request) {
  const largo = Number(request.headers.get('content-length') || 0);
  if (largo > MAXIMO_JSON) { await descartarCuerpo(request); return { error: 'El contenido es demasiado grande.' }; }
  const texto = await request.text();
  if (texto.length > MAXIMO_JSON) return { error: 'El contenido es demasiado grande.' };
  try { return { datos: JSON.parse(texto) }; } catch { return { error: 'El contenido no es válido.' }; }
}

/** Tipo de imagen por su contenido (no por lo que diga el navegador). */
export function tipoImagen(bytes) {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', tipo: 'image/jpeg' };
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return { ext: 'png', tipo: 'image/png' };
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') {
    return { ext: 'webp', tipo: 'image/webp' };
  }
  return null;
}

/**
 * almacenes: { estado, fotos, respaldos, intentos }
 * entorno: { ADMIN_PASSWORD_HASH, SESSION_SECRET }
 * inicial: { menu, temporada } del repositorio (se usa mientras no se haya guardado nada)
 */
export function crearServidor({ almacenes, entorno, inicial, ahora = () => Date.now() }) {
  const { estado: almEstado, fotos: almFotos, respaldos: almRespaldos, intentos: almIntentos } = almacenes;
  const configurado = Boolean(entorno.ADMIN_PASSWORD_HASH && entorno.SESSION_SECRET);

  async function leerEstado() {
    const r = await almEstado.getWithMetadata(CLAVE_ESTADO, { type: 'json' });
    if (r) return { estado: r.data, version: r.etag };
    return { estado: structuredClone(inicial), version: 'inicial' };
  }

  async function fotoExiste(url) {
    const nombre = url.replace(/^\/fotos\//, '');
    return Boolean(await almFotos.getWithMetadata(nombre, { type: 'arrayBuffer' }));
  }

  async function validarConFotos(estado) {
    const usadas = [...new Set(fotosUsadas(estado))];
    const existentes = new Set();
    for (const f of usadas) if (/^\/fotos\/[a-z0-9.-]+$/.test(f) && (await fotoExiste(f))) existentes.add(f);
    return validarEstado(estado, { fotoExiste: (u) => existentes.has(u) });
  }

  async function respaldar(estado, motivo) {
    const clave = `r-${String(ahora()).padStart(15, '0')}-${randomBytes(4).toString('hex')}`;
    await almRespaldos.setJSON(clave, { fecha: new Date(ahora()).toISOString(), motivo, estado });
    const { blobs } = await almRespaldos.list({ prefix: 'r-' });
    const sobran = blobs.map((b) => b.key).sort().slice(0, Math.max(0, blobs.length - MAXIMO_RESPALDOS));
    for (const k of sobran) await almRespaldos.delete(k);
  }

  /** Escribe solo si nadie guardó antes (misma versión que se leyó). */
  async function escribir(estado, version) {
    const opciones = version === 'inicial' ? { onlyIfNew: true } : { onlyIfMatch: version };
    const r = await almEstado.setJSON(CLAVE_ESTADO, estado, opciones);
    return r.modified ? r.etag : null;
  }

  const conflicto = () => fallo(409, 'El menú se cambió desde otro dispositivo. Recarga para ver la versión actual.');

  async function guardarNuevo(estadoNuevo, versionCliente, motivo) {
    const actual = await leerEstado();
    if (versionCliente !== actual.version) return conflicto();
    await respaldar(actual.estado, motivo);
    const version = await escribir(estadoNuevo, actual.version);
    if (!version) return conflicto();
    return json(200, { version });
  }

  // ---------- Rutas ----------

  async function login(request, ip) {
    if (!configurado) { await descartarCuerpo(request); return fallo(503, 'El panel todavía no tiene contraseña configurada.'); }
    const clave = claveIntentos(ip, entorno.SESSION_SECRET);
    const guardado = await almIntentos.getWithMetadata(clave, { type: 'json' });
    let registro = normalizarIntentos(guardado?.data, ahora());
    const espera = segundosBloqueo(registro, ahora());
    if (espera) {
      await descartarCuerpo(request);
      return fallo(429, `Demasiados intentos. Espera ${espera} segundos.`, { segundos: espera });
    }
    const { datos, error } = await leerJSON(request);
    if (error) return fallo(400, error);
    const correcta = await verificarContrasena(datos?.contrasena, entorno.ADMIN_PASSWORD_HASH);
    if (!correcta) {
      registro = registrarFallo(registro, ahora());
      await almIntentos.setJSON(clave, registro);
      const s = segundosBloqueo(registro, ahora());
      return s
        ? fallo(429, `Contraseña incorrecta. Demasiados intentos: espera ${s} segundos.`, { segundos: s })
        : fallo(401, 'Contraseña incorrecta.');
    }
    if (guardado) await almIntentos.delete(clave);
    return json(200, { ok: true }, { 'Set-Cookie': cookieSesion(crearSesion(entorno.SESSION_SECRET, ahora())) });
  }

  async function subirFoto(request) {
    const largo = Number(request.headers.get('content-length') || 0);
    if (largo > MAXIMO_FOTO) { await descartarCuerpo(request); return fallo(413, 'La foto pesa más de 4 MB.'); }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length) return fallo(400, 'No llegó ninguna foto.');
    if (bytes.length > MAXIMO_FOTO) return fallo(413, 'La foto pesa más de 4 MB.');
    const tipo = tipoImagen(bytes);
    if (!tipo) return fallo(415, 'Solo se aceptan fotos JPG, PNG o WebP.');
    const nombre = `${ahora().toString(36)}-${randomBytes(6).toString('hex')}.${tipo.ext}`;
    await almFotos.set(nombre, bytes, { metadata: { tipo: tipo.tipo } });
    return json(201, { url: `/fotos/${nombre}` });
  }

  async function listarRespaldos() {
    const { blobs } = await almRespaldos.list({ prefix: 'r-' });
    const lista = [];
    for (const { key } of blobs.sort((a, b) => (a.key < b.key ? 1 : -1))) {
      const r = await almRespaldos.getWithMetadata(key, { type: 'json' });
      if (!r) continue;
      const productos = [...(r.data.estado?.menu?.categorias || [])].reduce((n, c) => n + (c.productos?.length || 0), 0);
      lista.push({ id: key, fecha: r.data.fecha, motivo: r.data.motivo, productos });
    }
    return json(200, { respaldos: lista });
  }

  async function restaurar(request) {
    const { datos, error } = await leerJSON(request);
    if (error) return fallo(400, error);
    if (typeof datos?.id !== 'string' || !/^r-\d{15}-[0-9a-f]{8}$/.test(datos.id)) return fallo(400, 'Respaldo no válido.');
    const r = await almRespaldos.getWithMetadata(datos.id, { type: 'json' });
    if (!r) return fallo(404, 'Ese respaldo ya no existe.');
    const errores = await validarConFotos(r.data.estado);
    if (errores.length) return fallo(422, 'El respaldo no se puede restaurar.', { errores });
    return guardarNuevo(r.data.estado, datos.version, 'restaurar');
  }

  /** Atiende /api/*. `ip` viene de la plataforma. */
  async function api(request, { ip } = {}) {
    const url = new URL(request.url);
    const ruta = url.pathname.replace(/\/+$/, '');
    const metodo = request.method;

    // Protección contra solicitudes de otros sitios
    if (request.headers.get('x-menu') !== '1') { await descartarCuerpo(request); return fallo(403, 'Solicitud no permitida.'); }
    if (metodo !== 'GET' && metodo !== 'HEAD') {
      const origen = request.headers.get('origin');
      if (!origen || origen !== url.origin) { await descartarCuerpo(request); return fallo(403, 'Solicitud no permitida.'); }
    }

    const autenticado = configurado && sesionValida(leerCookie(request), entorno.SESSION_SECRET, ahora());

    if (ruta === '/api/sesion' && metodo === 'GET') return json(200, { configurado, autenticado });
    if (ruta === '/api/login' && metodo === 'POST') return login(request, ip);
    if (ruta === '/api/logout' && metodo === 'POST') {
      await descartarCuerpo(request);
      return json(200, { ok: true }, { 'Set-Cookie': cookieBorrar() });
    }

    const rutasConSesion = ['/api/menu', '/api/imagen', '/api/respaldos', '/api/respaldos/restaurar'];
    if (!rutasConSesion.includes(ruta)) { await descartarCuerpo(request); return fallo(404, 'No encontrado.'); }
    if (!autenticado) { await descartarCuerpo(request); return fallo(401, 'Tu sesión venció. Vuelve a entrar.'); }

    if (ruta === '/api/menu' && metodo === 'GET') {
      const { estado, version } = await leerEstado();
      return json(200, { ...estado, version });
    }
    if (ruta === '/api/menu' && metodo === 'PUT') {
      const { datos, error } = await leerJSON(request);
      if (error) return fallo(400, error);
      const nuevo = { menu: datos?.menu, temporada: datos?.temporada };
      const errores = await validarConFotos(nuevo);
      if (errores.length) return fallo(422, 'Hay datos que corregir antes de guardar.', { errores });
      return guardarNuevo(nuevo, datos.version, 'guardar');
    }
    if (ruta === '/api/imagen' && metodo === 'POST') return subirFoto(request);
    if (ruta === '/api/respaldos' && metodo === 'GET') return listarRespaldos();
    if (ruta === '/api/respaldos/restaurar' && metodo === 'POST') return restaurar(request);

    await descartarCuerpo(request);
    return fallo(405, 'Método no permitido.');
  }

  /** Atiende /menu.json, /menu-temporada.json y /fotos/*. */
  async function datos(request) {
    await descartarCuerpo(request);
    const { pathname } = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: SEGURIDAD });

    if (pathname === '/menu.json' || pathname === '/menu-temporada.json') {
      const { estado } = await leerEstado();
      return json(200, pathname === '/menu.json' ? estado.menu : estado.temporada);
    }
    const m = /^\/fotos\/([a-z0-9][a-z0-9-]{0,80}\.(?:jpg|png|webp))$/.exec(pathname);
    if (m) {
      const r = await almFotos.getWithMetadata(m[1], { type: 'arrayBuffer' });
      if (r) {
        return new Response(r.data, {
          status: 200,
          headers: {
            'Content-Type': r.metadata?.tipo || 'application/octet-stream',
            // Los nombres son únicos: la foto nunca cambia
            'Cache-Control': 'public, max-age=31536000, immutable',
            ...SEGURIDAD,
          },
        });
      }
    }
    return new Response('No encontrado', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SEGURIDAD } });
  }

  return { api, datos };
}
