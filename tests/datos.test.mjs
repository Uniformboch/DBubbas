// Pruebas de datos: el menú debe coincidir con la tabla que aprobó el café (etapa 3).
// Ignoran el campo `agotado`, porque el dueño lo cambia a diario.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  categorias, buscarProducto, tamanosDe, extrasDe, opcionesDe, nombrePedido, precioUnitario,
} from '../public/js/lib/catalogo.mjs';

const leer = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const menu = leer('menu.json');
const temporada = leer('menu-temporada.json');

// Tabla aprobada: sección → [precios, sabores]
const APROBADO = {
  frapeado: [{ mini: 39, grande: 65 }, ['Oreo', 'Mazapán', 'Chocolate', 'Vainilla', 'Coco', 'Caramelo', 'Matcha', 'Taro', 'Capuchino', 'Moka', 'Piña colada', 'Chai vainilla', 'Chai negro']],
  mix: [{ grande: 67 }, ['Moka-blanco', 'Cajeta-quemada', 'Taro-oreo', 'Choco-fresa', 'Matcha-coco', 'Taro-berry', 'Matcha-fresa']],
  soda: [{ mini: 36, grande: 60 }, ['Maracuya', 'Frambuesa', 'Blueberry', 'Cereza', 'Uva', 'Mango', 'Fresa']],
  smothie: [{ mini: 39, grande: 62 }, ['Lyche', 'Fresa', 'Mango', 'Kiwi', 'Blueberry', 'Frambuesa', 'Cereza', 'Maracuya', 'Manzana verde', 'Uva']],
  milk: [{ mini: 39, grande: 65 }, ['Café frío', 'Moka', 'Capuchino', 'Oreo', 'Matcha', 'Taro', 'Chocolate', 'Caramelo', 'Mazapán', 'Coco', 'Chai vainilla', 'Chai negro', 'Matcha coco']],
  calientes: [{ unico: 35 }, ['Moka', 'Capuchino', 'Oreo', 'Chocolate', 'Caramelo', 'Matcha', 'Coco-matcha', 'Taro', 'Chai negro', 'Chai vainilla', 'Café expreso']],
};
const PREFIJOS = { frapeado: 'Frapeado', mix: 'Bubba Mix', soda: 'Soda', smothie: 'Smothie', milk: 'Milk', calientes: 'Caliente' };
const BUBBAS = ['frapeado', 'mix', 'soda', 'smothie', 'milk'];
const TOPPINGS = ['Bobba normal (Tapioca)', 'Perla explosiva mango', 'Perla explosiva fresa', 'Perla explosiva blueberry', 'Perla explosiva taro', 'Perla explosiva kiwi', 'Jellys de mango', 'Jellys de coco', 'Jellys de lyche', 'Crema batida'];

const cat = (id) => menu.categorias.find((c) => c.id === id);
const prod = (id) => buscarProducto(menu, temporada, id);

test('configuración del negocio', () => {
  assert.equal(menu.config.negocio, "D'Bubbas Hospital");
  assert.match(menu.config.whatsapp, /^52\d{10}$/);
});

test('secciones en el orden del impreso', () => {
  assert.deepEqual(menu.categorias.map((c) => c.id), ['frapeado', 'mix', 'soda', 'smothie', 'milk', 'calientes', 'postres']);
  assert.equal(menu.categorias.filter((c) => c.grupo === 'comida').length, 1);
});

for (const [id, [precios, sabores]] of Object.entries(APROBADO)) {
  test(`${id}: sabores y precios aprobados`, () => {
    const c = cat(id);
    assert.deepEqual(c.productos.map((p) => p.nombre), sabores);
    for (const p of c.productos) assert.deepEqual(p.precios, precios, p.nombre);
    assert.equal(c.prefijoPedido, PREFIJOS[id]);
  });
}

test('postres: precios aprobados', () => {
  assert.deepEqual(prod('crepa-dulce').producto.precios, { unico: 48 });
  assert.deepEqual(prod('mini-hotcakes').producto.precios, { p12: 38, p25: 45 });
  assert.deepEqual(tamanosDe(menu, prod('mini-hotcakes').producto), ['p12', 'p25']);
  assert.equal(menu.tamanos.p12.nombre, '12 piezas');
});

test('63 productos y todos los ids son únicos', () => {
  const ids = categorias(menu, temporada).flatMap((c) => c.productos.map((p) => p.id));
  assert.equal(ids.length, 63);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(menu.categorias.map((c) => c.id)).size, menu.categorias.length);
  assert.equal(new Set(menu.extras.map((e) => e.id)).size, menu.extras.length);
});

test('extras: bubbas llevan los 10 toppings a $7', () => {
  for (const id of BUBBAS) {
    for (const p of cat(id).productos) {
      const ex = extrasDe(menu, cat(id), p);
      assert.deepEqual(ex.map((e) => e.nombre), TOPPINGS, `${id}/${p.id}`);
      assert.ok(ex.every((e) => e.precio === 7));
    }
  }
});

test('extras: calientes no llevan', () => {
  for (const p of cat('calientes').productos) assert.deepEqual(extrasDe(menu, cat('calientes'), p), []);
});

test('extras: postres a $15 según el producto', () => {
  const c = prod('crepa-dulce');
  const h = prod('mini-hotcakes');
  assert.deepEqual(extrasDe(menu, c.categoria, c.producto).map((e) => [e.nombre, e.precio]),
    [['Untable extra', 15], ['Fruta extra', 15], ['Topping extra', 15]]);
  assert.deepEqual(extrasDe(menu, h.categoria, h.producto).map((e) => [e.nombre, e.precio]),
    [['Mermelada extra', 15], ['Fruta extra', 15], ['Topping extra', 15]]);
});

test('opciones: topping gratis obligatorio en bubbas, nada en calientes', () => {
  for (const id of BUBBAS) {
    for (const p of cat(id).productos) {
      const [g, ...resto] = opcionesDe(cat(id), p);
      assert.equal(resto.length, 0);
      assert.equal(g.nombre, 'Topping gratis');
      assert.deepEqual(g.valores.map((x) => x.nombre), ['Sin topping', ...TOPPINGS]);
      assert.ok(g.valores.every((x) => !x.precio));
    }
  }
  for (const p of cat('calientes').productos) assert.deepEqual(opcionesDe(cat('calientes'), p), []);
});

test('opciones: crepa y hotcakes', () => {
  const c = prod('crepa-dulce');
  const oc = opcionesDe(c.categoria, c.producto);
  assert.deepEqual(oc.map((g) => g.nombre), ['Untable', 'Fruta', 'Topping']);
  assert.deepEqual(oc[0].valores.map((x) => x.nombre), ['M. Fresa', 'M. Zarzamora', 'Q. Philadelphia', 'Chocolate', 'Lechera', 'Cajeta', 'Nutella']);
  assert.deepEqual(oc[1].valores.map((x) => x.nombre), ['Fresa', 'Platano', 'Durazno']);
  assert.deepEqual(oc[2].valores.map((x) => [x.nombre, x.precio || 0]), [
    ['Coco rayado', 0], ['Chispas chocolate', 0], ['Chispas colores', 0], ['Mazapán', 0], ['Oreo', 0], ['Granola', 0],
    ['Crema batida', 15], ['Helado', 15], ['Mini kisses', 15]]);

  const h = prod('mini-hotcakes');
  const oh = opcionesDe(h.categoria, h.producto);
  assert.deepEqual(oh.map((g) => g.nombre), ['Topping', 'Mermelada', 'Fruta']);
  assert.deepEqual(oh[0].valores.map((x) => x.nombre), ['Coco rayado', 'Chispas chocolate', 'Chispas colores', 'Mini kisses', 'Mazapán', 'Oreo', 'Granola']);
  assert.deepEqual(oh[1].valores.map((x) => x.nombre), ['Fresa', 'Zarzamora', 'Caramelo', 'Chocolate', 'Lechera']);
  assert.deepEqual(oh[2].valores.map((x) => x.nombre), ['Fresa', 'Platano', 'Durazno', 'Helado']);
  for (const g of oh) assert.ok(g.valores.every((x) => !x.precio));
});

test('opciones: 2 a 15 valores con ids únicos', () => {
  for (const c of menu.categorias) {
    for (const p of c.productos) {
      for (const g of opcionesDe(c, p)) {
        assert.ok(g.valores.length >= 2 && g.valores.length <= 15, `${p.id}/${g.id}`);
        assert.equal(new Set(g.valores.map((x) => x.id)).size, g.valores.length);
      }
    }
  }
});

test('precios: enteros de 1 a 9999', () => {
  const todos = [
    ...menu.extras.map((e) => e.precio),
    ...menu.categorias.flatMap((c) => c.productos.flatMap((p) => [
      ...Object.values(p.precios),
      ...opcionesDe(c, p).flatMap((g) => g.valores.filter((x) => 'precio' in x).map((x) => x.precio)),
    ])),
  ];
  for (const n of todos) assert.ok(Number.isInteger(n) && n >= 1 && n <= 9999, String(n));
});

test('ejemplos de la etapa 3 suman bien', () => {
  const f = prod('frapeado-taro');
  assert.equal(nombrePedido(f.categoria, f.producto), 'Frapeado Taro');
  assert.equal(precioUnitario(menu, f.categoria, f.producto,
    { tamano: 'grande', opciones: { 'topping-gratis': 'bobba-normal-tapioca' }, extras: ['extra-perla-explosiva-mango'] }), 72);

  const c = prod('crepa-dulce');
  assert.equal(nombrePedido(c.categoria, c.producto), 'Crepa dulce');
  assert.equal(precioUnitario(menu, c.categoria, c.producto,
    { tamano: 'unico', opciones: { untable: 'nutella', fruta: 'fresa', topping: 'helado' } }), 63);

  const h = prod('mini-hotcakes');
  assert.equal(precioUnitario(menu, h.categoria, h.producto,
    { tamano: 'p12', opciones: { topping: 'oreo', mermelada: 'lechera', fruta: 'platano' } }), 38);
});

test('elecciones inválidas no tienen precio', () => {
  const m = prod('mix-taro-oreo');
  assert.equal(precioUnitario(menu, m.categoria, m.producto, { tamano: 'mini', opciones: { 'topping-gratis': 'sin-topping' } }), null);
  assert.equal(precioUnitario(menu, m.categoria, m.producto, { tamano: 'grande', opciones: {} }), null);
  const k = prod('calientes-moka');
  assert.equal(precioUnitario(menu, k.categoria, k.producto, { tamano: 'unico', extras: ['extra-crema-batida'] }), null);
  assert.equal(precioUnitario(menu, k.categoria, k.producto, { tamano: 'unico' }), 35);
});

test('temporada apagada y sin productos', () => {
  assert.equal(temporada.activa, false);
  assert.deepEqual(temporada.categoria.productos, []);
  assert.equal(categorias(menu, temporada).length, 7);
});
