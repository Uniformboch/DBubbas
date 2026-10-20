// Pruebas del carrito, las validaciones y el mensaje de WhatsApp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buscarProducto } from '../public/js/lib/catalogo.mjs';
import {
  agregar, cambiarCantidad, claveLinea, limpiar, resumen, detalleLinea, CANTIDAD_MAXIMA,
} from '../public/js/lib/carrito.mjs';
import { validarEleccion, validarCliente } from '../public/js/lib/validacion.mjs';
import { construirMensaje, enlaceWhatsApp } from '../public/js/lib/mensaje.mjs';

const leer = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const menuBase = leer('menu.json');
const temporada = leer('menu-temporada.json');
// Copia sin agotados: el dueño los cambia a diario y no deben afectar las pruebas
const nuevoMenu = () => {
  const m = structuredClone(menuBase);
  for (const c of m.categorias) for (const p of c.productos) delete p.agotado;
  return m;
};
const menu = nuevoMenu();

const taro = (extra = {}) => ({
  productoId: 'frapeado-taro', tamano: 'grande',
  opciones: { 'topping-gratis': 'bobba-normal-tapioca' }, extras: [], cantidad: 1, ...extra,
});
const crepa = (extra = {}) => ({
  productoId: 'crepa-dulce', tamano: 'unico',
  opciones: { untable: 'nutella', fruta: 'fresa', topping: 'helado' }, extras: [], cantidad: 1, ...extra,
});
const hotcakes = (extra = {}) => ({
  productoId: 'mini-hotcakes', tamano: 'p12',
  opciones: { topping: 'oreo', mermelada: 'lechera', fruta: 'platano' }, extras: [], cantidad: 2, ...extra,
});
const moka = (extra = {}) => ({ productoId: 'calientes-moka', tamano: 'unico', opciones: {}, extras: [], cantidad: 1, ...extra });

// ---------- Carrito ----------

test('carrito: la misma combinación se suma', () => {
  let l = agregar([], taro());
  l = agregar(l, taro({ cantidad: 2 }));
  assert.equal(l.length, 1);
  assert.equal(l[0].cantidad, 3);
});

test('carrito: el orden de extras no cambia la combinación', () => {
  const a = taro({ extras: ['extra-crema-batida', 'extra-perla-explosiva-mango'] });
  const b = taro({ extras: ['extra-perla-explosiva-mango', 'extra-crema-batida'] });
  assert.equal(claveLinea(a), claveLinea(b));
  assert.equal(agregar(agregar([], a), b).length, 1);
});

test('carrito: combinaciones distintas van separadas', () => {
  let l = agregar([], taro());
  l = agregar(l, taro({ tamano: 'mini' }));
  l = agregar(l, taro({ opciones: { 'topping-gratis': 'sin-topping' } }));
  l = agregar(l, taro({ extras: ['extra-jellys-de-coco'] }));
  l = agregar(l, moka());
  assert.equal(l.length, 5);
});

test('carrito: tope de cantidad y quitar al llegar a 0', () => {
  let l = agregar([], taro({ cantidad: 15 }));
  l = agregar(l, taro({ cantidad: 15 }));
  assert.equal(l[0].cantidad, CANTIDAD_MAXIMA);
  l = cambiarCantidad(l, 0, +1);
  assert.equal(l[0].cantidad, 20);
  l = cambiarCantidad(agregar([], moka()), 0, -1);
  assert.deepEqual(l, []);
});

test('carrito: resumen suma piezas y total', () => {
  let l = agregar([], taro({ extras: ['extra-perla-explosiva-mango'] })); // 72
  l = agregar(l, crepa()); // 63
  l = agregar(l, hotcakes()); // 2 × 38
  assert.deepEqual(resumen(menu, temporada, l), { piezas: 4, total: 72 + 63 + 76 });
});

test('carrito guardado: se descartan líneas que ya no existen o son raras', () => {
  const m = nuevoMenu();
  const guardado = [
    taro(),
    taro({ cantidad: 2 }), // repetida: se junta
    { ...moka(), productoId: 'producto-retirado' },
    taro({ tamano: 'mediano' }), // tamaño que no existe
    taro({ opciones: { 'topping-gratis': 'perla-de-chicle' } }), // opción que no existe
    taro({ opciones: {} }), // falta opción obligatoria
    taro({ opciones: { 'topping-gratis': 'sin-topping', salsa: 'roja' } }), // grupo de más
    taro({ extras: ['shot-extra'] }), // extra que no existe
    moka({ extras: ['extra-crema-batida'] }), // extra no permitido en calientes
    moka({ cantidad: 0 }), moka({ cantidad: 21 }), moka({ cantidad: 1.5 }), moka({ cantidad: '2' }),
    null, 'basura', { productoId: 5 },
    crepa(),
  ];
  const l = limpiar(m, temporada, guardado);
  assert.equal(l.length, 2);
  assert.equal(l[0].productoId, 'frapeado-taro');
  assert.equal(l[0].cantidad, 3);
  assert.equal(l[1].productoId, 'crepa-dulce');
  assert.deepEqual(limpiar(m, temporada, 'no es lista'), []);
});

test('carrito guardado: se descartan productos agotados u ocultos', () => {
  const m = nuevoMenu();
  buscarProducto(m, temporada, 'frapeado-taro').producto.agotado = true;
  buscarProducto(m, temporada, 'crepa-dulce').producto.disponible = false;
  assert.deepEqual(limpiar(m, temporada, [taro(), crepa(), moka()]).map((x) => x.productoId), ['calientes-moka']);
});

test('carrito guardado: si cambia el precio, se usa el nuevo', () => {
  const m = nuevoMenu();
  buscarProducto(m, temporada, 'calientes-moka').producto.precios.unico = 40;
  const l = limpiar(m, temporada, [moka({ cantidad: 2 })]);
  assert.equal(resumen(m, temporada, l).total, 80);
});

// ---------- Opciones obligatorias ----------

test('opciones obligatorias: sin elegir no se agrega', () => {
  const { categoria, producto } = buscarProducto(menu, temporada, 'frapeado-taro');
  assert.deepEqual(validarEleccion(menu, categoria, producto, { opciones: {}, cantidad: 1 }), {
    tamano: 'Elige tamaño para continuar.',
    'topping-gratis': 'Elige topping gratis para continuar.',
  });
  assert.deepEqual(validarEleccion(menu, categoria, producto, taro()), {});
});

test('opciones obligatorias: postres con opción que suma precio', () => {
  const { categoria, producto } = buscarProducto(menu, temporada, 'crepa-dulce');
  assert.deepEqual(validarEleccion(menu, categoria, producto, { tamano: 'unico', opciones: { untable: 'nutella' }, cantidad: 1 }), {
    fruta: 'Elige fruta para continuar.',
    topping: 'Elige topping para continuar.',
  });
  assert.deepEqual(validarEleccion(menu, categoria, producto, crepa()), {});
  assert.equal(detalleLinea(menu, temporada, crepa()).unitario, 63);
  assert.equal(detalleLinea(menu, temporada, crepa({ opciones: { untable: 'nutella', fruta: 'fresa', topping: 'oreo' } })).unitario, 48);
});

test('opciones obligatorias: Bubba Mix solo en grande; cantidad 1 a 20', () => {
  const { categoria, producto } = buscarProducto(menu, temporada, 'mix-taro-oreo');
  const e = { tamano: 'mini', opciones: { 'topping-gratis': 'sin-topping' }, cantidad: 0 };
  assert.deepEqual(Object.keys(validarEleccion(menu, categoria, producto, e)), ['tamano', 'cantidad']);
  assert.deepEqual(validarEleccion(menu, categoria, producto, { ...e, tamano: 'grande', cantidad: 20 }), {});
  assert.ok(validarEleccion(menu, categoria, producto, { ...e, tamano: 'grande', cantidad: 21 }).cantidad);
});

// ---------- Formulario ----------

test('formulario: obligatorios y dirección solo a domicilio', () => {
  const l = [moka()];
  assert.deepEqual(validarCliente({}, []), {
    carrito: 'Agrega al menos un producto.',
    nombre: 'Escribe tu nombre.',
    entrega: 'Elige cómo quieres recibir tu pedido.',
  });
  assert.deepEqual(validarCliente({ nombre: '  ', entrega: 'recoger' }, l), { nombre: 'Escribe tu nombre.' });
  assert.deepEqual(validarCliente({ nombre: 'Ana', entrega: 'recoger' }, l), {});
  assert.deepEqual(validarCliente({ nombre: 'Ana', entrega: 'domicilio', direccion: ' ' }, l), {
    direccion: 'Escribe la dirección de entrega.',
  });
  assert.deepEqual(validarCliente({ nombre: 'Ana', entrega: 'domicilio', direccion: 'Calle 1' }, l), {});
  assert.ok(validarCliente({ nombre: 'Ana', entrega: 'avion' }, l).entrega);
  assert.ok(validarCliente({ nombre: 'x'.repeat(61), entrega: 'recoger' }, l).nombre);
  assert.ok(validarCliente({ nombre: 'Ana', entrega: 'recoger', notas: 'x'.repeat(301) }, l).notas);
});

// ---------- Mensaje ----------

test('mensaje: formato exacto a domicilio con notas', () => {
  let l = agregar([], taro({ extras: ['extra-perla-explosiva-mango'] }));
  l = agregar(l, crepa());
  l = agregar(l, hotcakes());
  l = agregar(l, moka({ cantidad: 2 }));
  l = agregar(l, {
    productoId: 'soda-mango', tamano: 'mini', opciones: { 'topping-gratis': 'sin-topping' },
    extras: ['extra-jellys-de-coco', 'extra-crema-batida'], cantidad: 1,
  });
  const texto = construirMensaje(menu, temporada, l, {
    nombre: ' Ana ', entrega: 'domicilio', direccion: 'Calle Madero 123,\nCentro', notas: 'sin hielo',
  });
  assert.equal(texto, [
    "Hola, D'Bubbas Hospital. Quiero hacer un pedido:",
    '',
    '• 1 × Frapeado Taro (Grande, Bobba normal (Tapioca)) + Perla explosiva mango — $72',
    '• 1 × Crepa dulce (Nutella, Fresa, Helado) — $63',
    '• 2 × Mini hotcakes (12 piezas, Oreo, Lechera, Platano) — $76',
    '• 2 × Caliente Moka — $70',
    '• 1 × Soda Mango (Mini, Sin topping) + Jellys de coco, Crema batida — $50',
    '',
    '*Total: $331*',
    '',
    'Nombre: Ana',
    'Entrega: A domicilio',
    'Dirección: Calle Madero 123, · Centro',
    'Envío: por confirmar',
    'Notas: sin hielo',
  ].join('\n'));
});

test('mensaje: aclara la opción cuando el nombre se repite (Fresa mermelada / Fresa fruta)', () => {
  const l = [hotcakes({ tamano: 'p25', cantidad: 1, opciones: { topping: 'granola', mermelada: 'fresa', fruta: 'fresa' } })];
  const texto = construirMensaje(menu, temporada, l, { nombre: 'Ana', entrega: 'recoger' });
  assert.match(texto, /^• 1 × Mini hotcakes \(25 piezas, Granola, Mermelada: Fresa, Fruta: Fresa\) — \$45$/m);
});

test('mensaje: recoger sin notas no lleva dirección, envío ni notas', () => {
  const texto = construirMensaje(menu, temporada, [moka()], {
    nombre: 'Luis', entrega: 'recoger', direccion: 'no debe salir', notas: '   ',
  });
  assert.equal(texto, [
    "Hola, D'Bubbas Hospital. Quiero hacer un pedido:",
    '',
    '• 1 × Caliente Moka — $35',
    '',
    '*Total: $35*',
    '',
    'Nombre: Luis',
    'Entrega: Recoger en sucursal',
  ].join('\n'));
});

test('mensaje: enlace codificado para wa.me', () => {
  const url = enlaceWhatsApp(menu.config.whatsapp, "Hola, D'Bubbas.\n• 1 × Té & café — $35\n*Total*");
  assert.equal(url, 'https://wa.me/524771358745?text=' +
    'Hola%2C%20D\'Bubbas.%0A%E2%80%A2%201%20%C3%97%20T%C3%A9%20%26%20caf%C3%A9%20%E2%80%94%20%2435%0A*Total*');
  const vuelta = decodeURIComponent(new URL(url).searchParams.get('text') ? url.split('?text=')[1] : '');
  assert.equal(vuelta, "Hola, D'Bubbas.\n• 1 × Té & café — $35\n*Total*");
  assert.equal(enlaceWhatsApp('+52 477 135 8745', 'x'), 'https://wa.me/524771358745?text=x');
});
