// Menú público: carga los datos y dibuja secciones, chips y selector de grupo.
import { categorias, productosVisibles, tamanosDe } from './lib/catalogo.mjs';

const GRUPOS = { bebidas: 'Bebidas', comida: 'Postres' };

const $ = (sel) => document.querySelector(sel);
const estado = $('#estado');
const secciones = $('#secciones');
const chips = $('#chips');
const grupos = $('#grupos');
const navegacion = document.querySelector('.navegacion');

const app = { menu: null, temporada: null, grupo: 'bebidas' };

/** Crea un elemento con atributos e hijos (texto o nodos). Nunca usa innerHTML. */
function el(etiqueta, attrs = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') nodo.className = v;
    else if (k === 'dataset') Object.assign(nodo.dataset, v);
    else if (k === 'style') for (const [p, val] of Object.entries(v)) nodo.style.setProperty(p, val);
    else if (v === true) nodo.setAttribute(k, '');
    else nodo.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h != null && h !== false) nodo.append(h);
  return nodo;
}

export const dinero = (n) => `$${n}`;

function nombreTamano(clave) {
  if (clave === 'unico') return 'Precio';
  return app.menu.tamanos[clave]?.nombre || clave;
}

/** Texto para lectores de pantalla: "Taro, Mini $39, Grande $65". */
function etiquetaProducto(producto, columnas) {
  const precios = columnas
    .filter((t) => Number.isInteger(producto.precios[t]))
    .map((t) => (t === 'unico' ? dinero(producto.precios[t]) : `${nombreTamano(t)} ${dinero(producto.precios[t])}`));
  return [producto.nombre, ...precios, producto.agotado ? 'agotado' : null].filter(Boolean).join(', ');
}

function columnasDe(categoria, productos) {
  const usadas = new Set(productos.flatMap((p) => tamanosDe(app.menu, p)));
  const orden = [...Object.keys(app.menu.tamanos), 'unico'];
  return orden.filter((t) => usadas.has(t));
}

function dibujarTabla(categoria, productos) {
  const columnas = columnasDe(categoria, productos);
  const tabla = el('div', { class: 'tabla', style: { '--cols': String(columnas.length) } });
  tabla.append(el('div', { class: 'fila encabezado', 'aria-hidden': 'true' },
    el('span', { class: 'vacio' }),
    columnas.map((t) => el('span', {}, nombreTamano(t)))));
  for (const p of productos) {
    tabla.append(el('button', {
      type: 'button', class: 'fila producto', dataset: { producto: p.id },
      disabled: !!p.agotado, 'aria-label': etiquetaProducto(p, columnas),
    },
    el('span', { class: 'producto-nombre' }, p.nombre,
      p.agotado ? el('span', { class: 'etiqueta-agotado' }, 'Agotado') : null),
    columnas.map((t) => {
      const precio = p.precios[t];
      return Number.isInteger(precio)
        ? el('span', { class: 'producto-precio' }, dinero(precio))
        : el('span', { class: 'producto-precio sin' }, '—');
    })));
  }
  return tabla;
}

function dibujarTarjetas(categoria, productos) {
  const lista = el('div', { class: 'tarjetas' });
  for (const p of productos) {
    const tams = tamanosDe(app.menu, p);
    lista.append(el('button', {
      type: 'button', class: 'tarjeta', dataset: { producto: p.id },
      disabled: !!p.agotado, 'aria-label': etiquetaProducto(p, tams),
    },
    p.imagen ? el('img', { class: 'tarjeta-foto', src: p.imagen, alt: '', loading: 'lazy', decoding: 'async' }) : null,
    el('span', { class: 'tarjeta-nombre' }, p.nombre,
      p.agotado ? el('span', { class: 'etiqueta-agotado' }, 'Agotado') : null),
    el('span', { class: 'tarjeta-precios' },
      tams.map((t) => el('span', { class: 'tarjeta-precio' },
        t === 'unico' ? dinero(p.precios[t]) : `${nombreTamano(t)} ${dinero(p.precios[t])}`))),
    p.descripcion ? el('p', { class: 'tarjeta-desc' }, p.descripcion) : null));
  }
  return lista;
}

function dibujarMenu() {
  secciones.replaceChildren();
  const lista = categorias(app.menu, app.temporada)
    .map((c) => ({ c, productos: productosVisibles(c) }))
    .filter(({ productos }) => productos.length);

  for (const { c, productos } of lista) {
    const conTarjetas = c.grupo === 'comida' || productos.some((p) => p.imagen) || c.id === 'temporada';
    secciones.append(el('section', {
      class: 'seccion', id: `cat-${c.id}`, 'aria-labelledby': `tit-${c.id}`,
      dataset: { cat: c.id, grupo: c.grupo || 'bebidas' },
    },
    el('h2', { class: 'seccion-titulo', id: `tit-${c.id}` }, c.nombre),
    c.descripcion ? el('p', { class: 'seccion-desc' }, c.descripcion) : null,
    conTarjetas ? dibujarTarjetas(c, productos) : dibujarTabla(c, productos)));
  }

  // Selector Bebidas | Postres solo si hay más de un grupo
  const presentes = Object.keys(GRUPOS).filter((g) => lista.some(({ c }) => (c.grupo || 'bebidas') === g));
  grupos.replaceChildren(...presentes.map((g) => el('button', {
    type: 'button', class: 'grupo', dataset: { grupo: g }, 'aria-pressed': 'false',
  }, GRUPOS[g])));
  grupos.hidden = presentes.length < 2;
  if (!presentes.includes(app.grupo)) app.grupo = presentes[0];
}

function seccionesDelGrupo() {
  return [...secciones.querySelectorAll('.seccion')].filter((s) => s.dataset.grupo === app.grupo);
}

function mostrarGrupo(grupo) {
  app.grupo = grupo;
  for (const b of grupos.querySelectorAll('.grupo')) b.setAttribute('aria-pressed', String(b.dataset.grupo === grupo));
  for (const s of secciones.querySelectorAll('.seccion')) s.hidden = s.dataset.grupo !== grupo;
  chips.replaceChildren(...seccionesDelGrupo().map((s) => el('button', {
    type: 'button', class: 'chip', dataset: { cat: s.dataset.cat }, 'aria-current': 'false',
  }, s.querySelector('.seccion-titulo').textContent)));
  medirNavegacion();
  marcarSeccionVisible();
}

function irASeccion(catId, { enfocar = false, instantaneo = false } = {}) {
  const seccion = document.getElementById(`cat-${catId}`);
  if (!seccion) return;
  if (seccion.dataset.grupo !== app.grupo) mostrarGrupo(seccion.dataset.grupo);
  seccion.scrollIntoView({ block: 'start', behavior: instantaneo ? 'instant' : 'auto' });
  if (enfocar) {
    const titulo = seccion.querySelector('.seccion-titulo');
    titulo.setAttribute('tabindex', '-1');
    titulo.focus({ preventScroll: true });
  }
}

// Marca el chip de la sección que está bajo la barra fija
function marcarSeccionVisible() {
  const limite = navegacion.getBoundingClientRect().bottom + 12;
  const visibles = seccionesDelGrupo();
  let actual = visibles[0];
  for (const s of visibles) if (s.getBoundingClientRect().top <= limite) actual = s;
  // Al llegar al final de la página, la última sección es la activa
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) actual = visibles.at(-1);
  for (const chip of chips.querySelectorAll('.chip')) {
    const activo = actual && chip.dataset.cat === actual.dataset.cat;
    if ((chip.getAttribute('aria-current') === 'true') === activo) continue;
    chip.setAttribute('aria-current', String(activo));
    if (activo && chips.scrollWidth > chips.clientWidth) {
      chips.scrollTo({ left: chip.offsetLeft - chips.clientWidth / 2 + chip.offsetWidth / 2, behavior: 'smooth' });
    }
  }
}

function medirNavegacion() {
  document.documentElement.style.setProperty('--alto-nav', `${navegacion.offsetHeight}px`);
}

function seccionDelHash() {
  const m = /^#cat-(.+)$/.exec(decodeURIComponent(location.hash));
  return m ? m[1] : null;
}

async function cargar() {
  estado.replaceChildren('Cargando menú…');
  try {
    const [rm, rt] = await Promise.all([
      fetch('menu.json', { cache: 'no-store' }),
      fetch('menu-temporada.json', { cache: 'no-store' }),
    ]);
    if (!rm.ok) throw new Error(`menú ${rm.status}`);
    app.menu = await rm.json();
    app.temporada = rt.ok ? await rt.json() : null;
  } catch (err) {
    console.error(err);
    estado.replaceChildren('No se pudo cargar el menú. Revisa tu conexión.',
      el('button', { type: 'button', class: 'reintentar' }, 'Intentar de nuevo'));
    estado.querySelector('.reintentar').addEventListener('click', cargar);
    return;
  }
  estado.replaceChildren();
  dibujarMenu();
  const destino = seccionDelHash();
  const destinoValido = destino && document.getElementById(`cat-${destino}`);
  mostrarGrupo(destinoValido ? destinoValido.dataset.grupo : app.grupo);
  if (destinoValido) {
    // Tras cargar las letras, para que el salto no quede corrido por el cambio de tamaño del texto
    history.scrollRestoration = 'manual';
    await document.fonts.ready;
    irASeccion(destino, { instantaneo: true });
    marcarSeccionVisible();
  }
  document.dispatchEvent(new CustomEvent('menu:listo', { detail: app }));
}

grupos.addEventListener('click', (e) => {
  const b = e.target.closest('.grupo');
  if (!b || b.dataset.grupo === app.grupo) return;
  mostrarGrupo(b.dataset.grupo);
  const primera = seccionesDelGrupo()[0];
  if (primera && navegacion.getBoundingClientRect().top <= 0) primera.scrollIntoView({ block: 'start' });
});

chips.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  history.replaceState(null, '', `#cat-${chip.dataset.cat}`);
  irASeccion(chip.dataset.cat, { enfocar: true });
});

window.addEventListener('hashchange', () => {
  const destino = seccionDelHash();
  if (destino && app.menu) irASeccion(destino);
});

let pendiente = false;
window.addEventListener('scroll', () => {
  if (pendiente) return;
  pendiente = true;
  requestAnimationFrame(() => { pendiente = false; marcarSeccionVisible(); });
}, { passive: true });

new ResizeObserver(medirNavegacion).observe(navegacion);

export { app, el };

cargar();
