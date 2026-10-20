// Pruebas del panel en el servidor con un almacén en memoria que imita a Netlify Blobs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearServidor, MAXIMO_RESPALDOS, tipoImagen } from '../servidor/api.mjs';
import { AlmacenMemoria } from '../servidor/almacen-memoria.mjs';
import { cifrarContrasena, verificarContrasena, sesionValida, crearSesion, ITERACIONES } from '../servidor/seguridad.mjs';
import { validarEstado } from '../public/js/lib/validar-menu.mjs';

const leer = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const inicial = { menu: leer('menu.json'), temporada: leer('menu-temporada.json') };
const ORIGEN = 'https://dbubbas.example';
const CONTRASENA = 'prueba-de-panel-123';
// Para que las pruebas sean rápidas se usan menos iteraciones; la cifra real se prueba aparte.
const HASH = await cifrarContrasena(CONTRASENA, 100_000);

function armar({ conContrasena = true } = {}) {
  let reloj = Date.UTC(2026, 9, 20, 12, 0, 0);
  const almacenes = {
    estado: new AlmacenMemoria(), fotos: new AlmacenMemoria(),
    respaldos: new AlmacenMemoria(), intentos: new AlmacenMemoria(),
  };
  const entorno = conContrasena ? { ADMIN_PASSWORD_HASH: HASH, SESSION_SECRET: 'secreto-de-pruebas-0123456789abcdef' } : {};
  const s = crearServidor({ almacenes, entorno, inicial, ahora: () => reloj });
  let cookie = '';
  const pedir = async (metodo, ruta, { cuerpo, crudo, encabezados = {}, sinCookie = false, ip = '1.2.3.4' } = {}) => {
    const headers = { 'X-Menu': '1', ...encabezados };
    if (metodo !== 'GET' && !('Origin' in headers)) headers.Origin = ORIGEN;
    if (cookie && !sinCookie) headers.Cookie = cookie;
    let body;
    if (cuerpo !== undefined) { body = JSON.stringify(cuerpo); headers['Content-Type'] = 'application/json'; }
    if (crudo !== undefined) body = crudo;
    for (const [k, v] of Object.entries(headers)) if (v === null) delete headers[k];
    const req = new Request(ORIGEN + ruta, { method: metodo, headers, body });
    const res = ruta.startsWith('/api/') ? await s.api(req, { ip }) : await s.datos(req);
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const tipo = res.headers.get('content-type') || '';
    const datos = tipo.includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer());
    return { estado: res.status, datos, res };
  };
  const entrar = () => pedir('POST', '/api/login', { cuerpo: { contrasena: CONTRASENA } });
  return { pedir, entrar, almacenes, avanzar: (ms) => { reloj += ms; }, get cookie() { return cookie; } };
}

const sinAgotados = (m) => JSON.stringify(m, (k, v) => (k === 'agotado' ? undefined : v));
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 2, 3]);

// ---------- Seguridad básica ----------

test('contraseña: PBKDF2-SHA256 con 600 000 iteraciones', async () => {
  const h = await cifrarContrasena('una contraseña', ITERACIONES);
  assert.match(h, /^pbkdf2-sha256\$600000\$[\w-]+\$[\w-]{43}$/);
  assert.equal(await verificarContrasena('una contraseña', h), true);
  assert.equal(await verificarContrasena('otra', h), false);
  assert.equal(await verificarContrasena('una contraseña', 'texto-plano'), false);
});

test('sesión: firmada y vence en 12 horas', () => {
  const t0 = 1_000_000;
  const tok = crearSesion('s', t0);
  assert.equal(sesionValida(tok, 's', t0 + 1000), true);
  assert.equal(sesionValida(tok, 'otro', t0 + 1000), false);
  assert.equal(sesionValida(tok.replace('v1.', 'v1.9'), 's', t0), false);
  assert.equal(sesionValida(tok, 's', t0 + 12 * 3600_000 + 1), false);
});

test('sin contraseña configurada: configurado false y no deja entrar', async () => {
  const p = armar({ conContrasena: false });
  assert.deepEqual((await p.pedir('GET', '/api/sesion')).datos, { configurado: false, autenticado: false });
  assert.equal((await p.entrar()).estado, 503);
  assert.equal((await p.pedir('GET', '/api/menu')).estado, 401);
});

test('panel: sesión requerida', async () => {
  const p = armar();
  assert.deepEqual((await p.pedir('GET', '/api/sesion')).datos, { configurado: true, autenticado: false });
  assert.equal((await p.pedir('GET', '/api/menu')).estado, 401);
  assert.equal((await p.pedir('PUT', '/api/menu', { cuerpo: { ...inicial, version: 'inicial' } })).estado, 401);
  assert.equal((await p.pedir('POST', '/api/imagen', { crudo: JPG })).estado, 401);
  assert.equal((await p.pedir('GET', '/api/respaldos')).estado, 401);
  assert.equal((await p.pedir('POST', '/api/respaldos/restaurar', { cuerpo: { id: 'x' } })).estado, 401);
});

test('panel: rechaza otros orígenes y solicitudes sin encabezado propio', async () => {
  const p = armar();
  assert.equal((await p.pedir('POST', '/api/login', { cuerpo: { contrasena: CONTRASENA }, encabezados: { Origin: 'https://malo.example' } })).estado, 403);
  assert.equal((await p.pedir('POST', '/api/login', { cuerpo: { contrasena: CONTRASENA }, encabezados: { Origin: null } })).estado, 403);
  assert.equal((await p.pedir('GET', '/api/sesion', { encabezados: { 'X-Menu': null } })).estado, 403);
  assert.equal(p.cookie, '');
  await p.entrar();
  assert.equal((await p.pedir('PUT', '/api/menu', { cuerpo: { ...inicial, version: 'inicial' }, encabezados: { Origin: 'https://malo.example' } })).estado, 403);
});

test('panel: entrada correcta da cookie segura de 12 horas', async () => {
  const p = armar();
  const r = await p.entrar();
  assert.equal(r.estado, 200);
  const sc = r.res.headers.get('set-cookie');
  for (const parte of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=43200']) assert.ok(sc.includes(parte), parte);
  assert.deepEqual((await p.pedir('GET', '/api/sesion')).datos, { configurado: true, autenticado: true });
  assert.equal((await p.pedir('GET', '/api/menu')).estado, 200);
  p.avanzar(12 * 3600_000 + 1000);
  assert.equal((await p.pedir('GET', '/api/menu')).estado, 401);
});

test('panel: salir borra la cookie', async () => {
  const p = armar();
  await p.entrar();
  const r = await p.pedir('POST', '/api/logout');
  assert.match(r.res.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await p.pedir('GET', '/api/menu')).estado, 401);
});

test('panel: bloqueo por IP tras 5 errores (30 s, luego el doble, hasta 15 min)', async () => {
  const p = armar();
  const mal = (ip = '1.2.3.4') => p.pedir('POST', '/api/login', { cuerpo: { contrasena: 'mala' }, ip });
  for (let i = 0; i < 4; i++) assert.equal((await mal()).estado, 401);
  let r = await mal();
  assert.equal(r.estado, 429);
  assert.equal(r.datos.segundos, 30);
  // Bloqueado: ni la contraseña correcta entra, y otra IP no se afecta
  assert.equal((await p.entrar()).estado, 429);
  assert.equal((await mal('5.6.7.8')).estado, 401);
  p.avanzar(30_000);
  r = await mal();
  assert.equal(r.datos.segundos, 60);
  const esperas = [];
  for (let i = 0; i < 6; i++) { p.avanzar(r.datos.segundos * 1000); r = await mal(); esperas.push(r.datos.segundos); }
  assert.deepEqual(esperas, [120, 240, 480, 900, 900, 900]);
  p.avanzar(900_000);
  assert.equal((await p.entrar()).estado, 200);
  // Al entrar bien se olvida el registro
  assert.equal((await mal()).estado, 401);
});

test('panel: no se guarda la IP tal cual', async () => {
  const p = armar();
  await p.pedir('POST', '/api/login', { cuerpo: { contrasena: 'mala' }, ip: '200.1.2.3' });
  const claves = [...p.almacenes.intentos.entradas.keys()];
  assert.equal(claves.length, 1);
  assert.ok(!claves[0].includes('200.1.2.3'));
});

// ---------- Menú ----------

test('datos públicos: sin guardado sirve el menú del repositorio', async () => {
  const p = armar();
  const r = await p.pedir('GET', '/menu.json');
  assert.equal(r.estado, 200);
  assert.equal(r.res.headers.get('cache-control'), 'no-store');
  assert.equal(sinAgotados(r.datos), sinAgotados(inicial.menu));
  assert.deepEqual((await p.pedir('GET', '/menu-temporada.json')).datos, inicial.temporada);
  assert.equal((await p.pedir('GET', '/data/menu.json')).estado, 404);
});

test('guardar: agotado → guardar → se ve en el menú público, con respaldo', async () => {
  const p = armar();
  await p.entrar();
  const { datos } = await p.pedir('GET', '/api/menu');
  assert.equal(datos.version, 'inicial');
  datos.menu.categorias[0].productos[0].agotado = true;
  const r = await p.pedir('PUT', '/api/menu', { cuerpo: datos });
  assert.equal(r.estado, 200);
  assert.ok(r.datos.version && r.datos.version !== 'inicial');
  const publico = (await p.pedir('GET', '/menu.json')).datos;
  assert.equal(publico.categorias[0].productos[0].agotado, true);
  const resp = (await p.pedir('GET', '/api/respaldos')).datos.respaldos;
  assert.equal(resp.length, 1);
  assert.equal(resp[0].productos, 63);
  // El segundo guardado necesita la versión nueva
  datos.menu.categorias[0].productos[0].agotado = false;
  assert.equal((await p.pedir('PUT', '/api/menu', { cuerpo: { ...datos, version: r.datos.version } })).estado, 200);
});

test('guardar: conflicto de versión responde 409', async () => {
  const p = armar();
  await p.entrar();
  const { datos } = await p.pedir('GET', '/api/menu');
  assert.equal((await p.pedir('PUT', '/api/menu', { cuerpo: datos })).estado, 200);
  const viejo = await p.pedir('PUT', '/api/menu', { cuerpo: datos }); // sigue con version "inicial"
  assert.equal(viejo.estado, 409);
  assert.match(viejo.datos.error, /otro dispositivo/);
  assert.equal((await p.pedir('PUT', '/api/menu', { cuerpo: { ...datos, version: '"inventada"' } })).estado, 409);
});

test('guardar: dos guardados al mismo tiempo, solo uno gana', async () => {
  const p = armar();
  await p.entrar();
  const { datos } = await p.pedir('GET', '/api/menu');
  const a = structuredClone(datos);
  const b = structuredClone(datos);
  a.menu.config.negocio = 'Guardado A';
  b.menu.config.negocio = 'Guardado B';
  const [ra, rb] = await Promise.all([
    p.pedir('PUT', '/api/menu', { cuerpo: a }),
    p.pedir('PUT', '/api/menu', { cuerpo: b }),
  ]);
  assert.deepEqual([ra.estado, rb.estado].sort(), [200, 409]);
  const ganador = ra.estado === 200 ? 'Guardado A' : 'Guardado B';
  assert.equal((await p.pedir('GET', '/menu.json')).datos.config.negocio, ganador);
  // Lo mismo cuando ya existe un guardado (escritura con etag)
  const { datos: d2 } = await p.pedir('GET', '/api/menu');
  const c = structuredClone(d2); c.menu.config.negocio = 'C';
  const e = structuredClone(d2); e.menu.config.negocio = 'E';
  const rs = await Promise.all([p.pedir('PUT', '/api/menu', { cuerpo: c }), p.pedir('PUT', '/api/menu', { cuerpo: e })]);
  assert.deepEqual(rs.map((x) => x.estado).sort(), [200, 409]);
});

test('guardar: menú inválido no se guarda ni se respalda', async () => {
  const p = armar();
  await p.entrar();
  const { datos } = await p.pedir('GET', '/api/menu');
  const malo = structuredClone(datos);
  malo.menu.categorias[0].productos[0].precios.grande = 0;
  malo.menu.categorias[0].productos[1].id = malo.menu.categorias[0].productos[0].id;
  malo.menu.categorias[0].productos[2].colorFavorito = 'azul';
  malo.menu.categorias[0].opciones[0].valores = [malo.menu.categorias[0].opciones[0].valores[0]];
  malo.menu.config.whatsapp = '12345';
  malo.menu.categorias[1].productos[0].imagen = '/fotos/no-existe.jpg';
  const r = await p.pedir('PUT', '/api/menu', { cuerpo: malo });
  assert.equal(r.estado, 422);
  const texto = r.datos.errores.join('\n');
  for (const esperado of ['precio debe ser un número entero de 1 a 9999', 'identificador repetido', 'campo desconocido "colorFavorito"', 'de 2 a 15 valores', 'WhatsApp', 'la foto no existe']) {
    assert.ok(texto.includes(esperado), esperado);
  }
  assert.equal((await p.pedir('GET', '/api/respaldos')).datos.respaldos.length, 0);
  assert.equal(p.almacenes.estado.entradas.size, 0);
  assert.equal((await p.pedir('PUT', '/api/menu', { crudo: '{no es json', encabezados: { 'Content-Type': 'application/json' } })).estado, 400);
});

test('validación: el menú del repositorio es válido y la temporada exige precio único', () => {
  assert.deepEqual(validarEstado(inicial), []);
  const t = structuredClone(inicial);
  t.temporada.categoria.productos.push({ id: 'pay', nombre: 'Pay', precios: { grande: 50 } });
  assert.match(validarEstado(t).join(), /precio es único/);
  const u = structuredClone(inicial);
  u.menu.categorias[0].productos[0].precios.mediano = 40;
  assert.match(validarEstado(u).join(), /tamaño "mediano" no existe/);
  const x = structuredClone(inicial);
  x.menu.categorias[0].extrasPermitidos.push('shot');
  assert.match(validarEstado(x).join(), /extra "shot" no existe/);
});

// ---------- Fotos ----------

test('fotos: se suben verificadas por contenido y se entregan con caché larga', async () => {
  const p = armar();
  await p.entrar();
  const r = await p.pedir('POST', '/api/imagen', { crudo: JPG, encabezados: { 'Content-Type': 'image/jpeg' } });
  assert.equal(r.estado, 201);
  assert.match(r.datos.url, /^\/fotos\/[a-z0-9]+-[0-9a-f]{12}\.jpg$/);
  const f = await p.pedir('GET', r.datos.url);
  assert.equal(f.estado, 200);
  assert.equal(f.res.headers.get('content-type'), 'image/jpeg');
  assert.match(f.res.headers.get('cache-control'), /immutable/);
  assert.deepEqual([...f.datos], [...JPG]);
  // Usarla en temporada y guardar
  const { datos } = await p.pedir('GET', '/api/menu');
  datos.temporada.activa = true;
  datos.temporada.categoria.productos.push({ id: 'frappe-calabaza', nombre: 'Frappé de calabaza', precios: { unico: 70 }, imagen: r.datos.url });
  assert.equal((await p.pedir('PUT', '/api/menu', { cuerpo: datos })).estado, 200);
  assert.equal((await p.pedir('GET', '/menu-temporada.json')).datos.categoria.productos[0].imagen, r.datos.url);
  assert.equal((await p.pedir('GET', '/fotos/no-existe.jpg')).estado, 404);
  assert.equal((await p.pedir('GET', '/fotos/..%2Fmenu.json')).estado, 404);
});

test('fotos: rechaza lo que no es JPG, PNG o WebP aunque diga serlo, y lo de más de 4 MB', async () => {
  const p = armar();
  await p.entrar();
  const html = new TextEncoder().encode('<script>alert(1)</script>');
  assert.equal((await p.pedir('POST', '/api/imagen', { crudo: html, encabezados: { 'Content-Type': 'image/jpeg' } })).estado, 415);
  const grande = new Uint8Array(4 * 1024 * 1024 + 1); grande.set(JPG);
  assert.equal((await p.pedir('POST', '/api/imagen', { crudo: grande })).estado, 413);
  assert.equal((await p.pedir('POST', '/api/imagen', { crudo: new Uint8Array(0) })).estado, 400);
  assert.equal(p.almacenes.fotos.entradas.size, 0);
  assert.equal(tipoImagen(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).ext, 'png');
  assert.equal(tipoImagen(new TextEncoder().encode('RIFF0000WEBPVP8 ')).ext, 'webp');
});

// ---------- Respaldos ----------

test('respaldos: restaurar una versión anterior (también se respalda antes)', async () => {
  const p = armar();
  await p.entrar();
  let { datos } = await p.pedir('GET', '/api/menu');
  datos.menu.categorias[0].productos[0].precios.grande = 70;
  let r = await p.pedir('PUT', '/api/menu', { cuerpo: datos });
  const [respaldo] = (await p.pedir('GET', '/api/respaldos')).datos.respaldos;
  assert.equal((await p.pedir('GET', '/menu.json')).datos.categorias[0].productos[0].precios.grande, 70);
  // Versión vieja: 409
  assert.equal((await p.pedir('POST', '/api/respaldos/restaurar', { cuerpo: { id: respaldo.id, version: 'inicial' } })).estado, 409);
  p.avanzar(1000);
  r = await p.pedir('POST', '/api/respaldos/restaurar', { cuerpo: { id: respaldo.id, version: r.datos.version } });
  assert.equal(r.estado, 200);
  assert.equal((await p.pedir('GET', '/menu.json')).datos.categorias[0].productos[0].precios.grande, 65);
  const lista = (await p.pedir('GET', '/api/respaldos')).datos.respaldos;
  assert.equal(lista.length, 2);
  assert.equal(lista[0].motivo, 'restaurar');
  assert.equal((await p.pedir('POST', '/api/respaldos/restaurar', { cuerpo: { id: 'r-000000000000000-00000000', version: r.datos.version } })).estado, 404);
  assert.equal((await p.pedir('POST', '/api/respaldos/restaurar', { cuerpo: { id: '../x', version: r.datos.version } })).estado, 400);
});

test('respaldos: se conservan solo los últimos 60', async () => {
  const p = armar();
  await p.entrar();
  let { datos } = await p.pedir('GET', '/api/menu');
  let version = datos.version;
  for (let i = 0; i < MAXIMO_RESPALDOS + 5; i++) {
    p.avanzar(1000);
    datos.menu.config.negocio = `Versión ${i}`;
    const r = await p.pedir('PUT', '/api/menu', { cuerpo: { ...datos, version } });
    assert.equal(r.estado, 200);
    version = r.datos.version;
  }
  const lista = (await p.pedir('GET', '/api/respaldos')).datos.respaldos;
  assert.equal(lista.length, MAXIMO_RESPALDOS);
  assert.equal(p.almacenes.respaldos.entradas.size, MAXIMO_RESPALDOS);
  // El más reciente primero: es la versión anterior a la última guardada
  const ultimo = await p.almacenes.respaldos.getWithMetadata(lista[0].id, { type: 'json' });
  assert.equal(ultimo.data.estado.menu.config.negocio, `Versión ${MAXIMO_RESPALDOS + 3}`);
});

test('rutas desconocidas responden 404 y métodos no permitidos 405', async () => {
  const p = armar();
  await p.entrar();
  assert.equal((await p.pedir('GET', '/api/secreto')).estado, 404);
  assert.equal((await p.pedir('DELETE', '/api/menu')).estado, 405);
});
