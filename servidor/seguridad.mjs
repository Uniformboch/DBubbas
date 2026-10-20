// Contraseña (PBKDF2-SHA256), sesión firmada (HMAC) y bloqueo por intentos.
import { pbkdf2, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);

export const ITERACIONES = 600_000;
export const DURACION_SESION_MS = 12 * 60 * 60 * 1000;
export const COOKIE = 'dbubbas_sesion';

// ---------- Contraseña ----------

/** Devuelve "pbkdf2-sha256$600000$<sal>$<hash>" (base64url). */
export async function cifrarContrasena(contrasena, iteraciones = ITERACIONES) {
  const sal = randomBytes(16);
  const hash = await pbkdf2Async(contrasena, sal, iteraciones, 32, 'sha256');
  return `pbkdf2-sha256$${iteraciones}$${sal.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verificarContrasena(contrasena, guardado) {
  if (typeof contrasena !== 'string' || typeof guardado !== 'string') return false;
  const partes = guardado.split('$');
  if (partes.length !== 4 || partes[0] !== 'pbkdf2-sha256') return false;
  const iteraciones = Number(partes[1]);
  if (!Number.isInteger(iteraciones) || iteraciones < 100_000) return false;
  const sal = Buffer.from(partes[2], 'base64url');
  const esperado = Buffer.from(partes[3], 'base64url');
  if (!sal.length || esperado.length !== 32) return false;
  const hash = await pbkdf2Async(contrasena, sal, iteraciones, 32, 'sha256');
  return timingSafeEqual(hash, esperado);
}

// ---------- Sesión ----------

const firma = (secreto, datos) => createHmac('sha256', secreto).update(datos).digest('base64url');

/** Token "v1.<vence>.<aleatorio>.<firma>". */
export function crearSesion(secreto, ahora) {
  const datos = `v1.${ahora + DURACION_SESION_MS}.${randomBytes(12).toString('base64url')}`;
  return `${datos}.${firma(secreto, datos)}`;
}

export function sesionValida(token, secreto, ahora) {
  if (typeof token !== 'string' || !secreto) return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const datos = token.slice(0, i);
  const recibida = Buffer.from(token.slice(i + 1));
  const esperada = Buffer.from(firma(secreto, datos));
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return false;
  const [version, vence] = datos.split('.');
  return version === 'v1' && Number(vence) > ahora;
}

export function cookieSesion(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURACION_SESION_MS / 1000}`;
}

export function cookieBorrar() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function leerCookie(request, nombre = COOKIE) {
  const encabezado = request.headers.get('cookie') || '';
  for (const parte of encabezado.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return v.join('=');
  }
  return null;
}

// ---------- Bloqueo por intentos ----------

export const INTENTOS_PERMITIDOS = 5;
export const BLOQUEO_INICIAL_MS = 30_000;
export const BLOQUEO_MAXIMO_MS = 15 * 60_000;
const OLVIDAR_MS = 24 * 60 * 60_000;

/** Clave del registro de intentos: la IP cifrada (no se guarda la IP tal cual). */
export function claveIntentos(ip, secreto) {
  return `ip-${firma(secreto || 'sin-secreto', String(ip || 'desconocida')).slice(0, 32)}`;
}

/** Estado limpio si el registro es viejo o no existe. */
export function normalizarIntentos(registro, ahora) {
  if (!registro || typeof registro !== 'object' || ahora - (registro.ultimo || 0) > OLVIDAR_MS) {
    return { fallos: 0, bloqueos: 0, hasta: 0, ultimo: ahora };
  }
  return { fallos: registro.fallos || 0, bloqueos: registro.bloqueos || 0, hasta: registro.hasta || 0, ultimo: registro.ultimo };
}

/** Segundos que faltan de bloqueo (0 si puede intentar). */
export function segundosBloqueo(registro, ahora) {
  return registro.hasta > ahora ? Math.ceil((registro.hasta - ahora) / 1000) : 0;
}

/**
 * Registra un intento fallido. Tras 5 fallos se bloquea 30 s; después de un primer bloqueo,
 * cada fallo vuelve a bloquear el doble de tiempo, hasta 15 minutos.
 */
export function registrarFallo(registro, ahora) {
  const r = { ...registro, fallos: registro.fallos + 1, ultimo: ahora };
  if (r.bloqueos > 0 || r.fallos >= INTENTOS_PERMITIDOS) {
    r.bloqueos += 1;
    r.hasta = ahora + Math.min(BLOQUEO_INICIAL_MS * 2 ** (r.bloqueos - 1), BLOQUEO_MAXIMO_MS);
    r.fallos = 0;
  }
  return r;
}
