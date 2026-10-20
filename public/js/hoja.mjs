// Hoja de producto: tamaño, opciones obligatorias, extras y cantidad.
import { buscarProducto, tamanosDe, opcionesDe, extrasDe, nombrePedido } from './lib/catalogo.mjs';
import { CANTIDAD_MAXIMA } from './lib/carrito.mjs';
import { validarEleccion } from './lib/validacion.mjs';
import { el, dinero, abrirDialogo, cerrarDialogo, cerrarAlTocarFondo } from './dom.mjs';
import { agregarAlPedido } from './pedido.mjs';

const dialogo = document.getElementById('hoja-producto');
cerrarAlTocarFondo(dialogo);

function grupoRadios({ id, leyenda, nombre, valores }) {
  return el('fieldset', { class: 'grupo-opciones', dataset: { campo: id }, 'aria-describedby': `err-${id}` },
    el('legend', {}, leyenda),
    el('p', { class: 'error', id: `err-${id}` }),
    el('div', { class: 'opciones' }, valores.map((v) => el('label', { class: 'opcion' },
      el('input', { type: 'radio', name: nombre, value: v.id }),
      el('span', { class: 'opcion-nombre' }, v.nombre),
      v.precio ? el('span', { class: 'opcion-precio' }, v.precio) : null))));
}

export function abrirHoja(app, productoId, origen) {
  const encontrado = buscarProducto(app.menu, app.temporada, productoId);
  if (!encontrado || encontrado.producto.agotado) return;
  const { categoria, producto } = encontrado;
  const menu = app.menu;

  const tamanos = tamanosDe(menu, producto);
  const grupos = opcionesDe(categoria, producto);
  const extras = extrasDe(menu, categoria, producto);
  let cantidad = 1;

  const nombreTam = (t) => menu.tamanos[t]?.nombre || t;

  const campos = [];
  // Tamaño solo si hay más de uno
  if (tamanos.length > 1) {
    campos.push(grupoRadios({
      id: 'tamano', leyenda: 'Tamaño', nombre: 'tamano',
      valores: tamanos.map((t) => ({ id: t, nombre: nombreTam(t), precio: dinero(producto.precios[t]) })),
    }));
  }
  for (const g of grupos) {
    campos.push(grupoRadios({
      id: g.id, leyenda: g.nombre, nombre: `op-${g.id}`,
      valores: g.valores.map((v) => ({ id: v.id, nombre: v.nombre, precio: v.precio ? `+${dinero(v.precio)}` : null })),
    }));
  }
  if (extras.length) {
    campos.push(el('fieldset', { class: 'grupo-opciones' },
      el('legend', {}, 'Extras ', el('span', { class: 'opcional' }, '(opcional)')),
      el('div', { class: 'opciones' }, extras.map((x) => el('label', { class: 'opcion' },
        el('input', { type: 'checkbox', name: 'extra', value: x.id }),
        el('span', { class: 'opcion-nombre' }, x.nombre),
        el('span', { class: 'opcion-precio' }, `+${dinero(x.precio)}`))))));
  }

  const valorCantidad = el('output', { class: 'cantidad-valor', id: 'hoja-cantidad', 'aria-live': 'polite' }, '1');
  const menos = el('button', { type: 'button', class: 'contador-boton', 'aria-label': 'Quitar uno' }, '−');
  const mas = el('button', { type: 'button', class: 'contador-boton', 'aria-label': 'Agregar uno' }, '+');
  const errCantidad = el('p', { class: 'error', id: 'err-cantidad' });
  const boton = el('button', { type: 'submit', class: 'boton-principal' }, 'Agregar');

  const titulo = el('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, nombrePedido(categoria, producto));
  const cerrar = el('button', { type: 'button', class: 'cerrar', 'aria-label': 'Cerrar' }, '×');
  const precioFijo = tamanos.length === 1
    ? el('p', { class: 'hoja-precio' },
      tamanos[0] === 'unico' ? dinero(producto.precios.unico) : `${nombreTam(tamanos[0])} ${dinero(producto.precios[tamanos[0]])}`)
    : null;

  const form = el('form', { class: 'hoja-form', novalidate: true },
    el('header', { class: 'hoja-cabeza' }, titulo, cerrar),
    el('div', { class: 'hoja-cuerpo' },
      producto.imagen ? el('img', { class: 'hoja-foto', src: producto.imagen, alt: '' }) : null,
      producto.descripcion ? el('p', { class: 'hoja-desc' }, producto.descripcion) : null,
      precioFijo,
      campos),
    el('footer', { class: 'hoja-pie' },
      el('div', { class: 'cantidad', role: 'group', 'aria-label': 'Cantidad', 'aria-describedby': 'err-cantidad' },
        menos, valorCantidad, mas),
      boton,
      errCantidad));

  function leerEleccion() {
    const datos = new FormData(form);
    const opciones = {};
    for (const g of grupos) {
      const v = datos.get(`op-${g.id}`);
      if (v) opciones[g.id] = v;
    }
    return {
      productoId: producto.id,
      tamano: tamanos.length === 1 ? tamanos[0] : datos.get('tamano'),
      opciones,
      extras: datos.getAll('extra'),
      cantidad,
    };
  }

  // Precio en vivo: lo que ya se eligió, por la cantidad
  function actualizarPrecio() {
    const e = leerEleccion();
    const base = producto.precios[e.tamano];
    if (!Number.isInteger(base)) {
      boton.textContent = 'Agregar';
      return;
    }
    let unitario = base;
    for (const g of grupos) unitario += g.valores.find((v) => v.id === e.opciones[g.id])?.precio || 0;
    for (const id of e.extras) unitario += extras.find((x) => x.id === id)?.precio || 0;
    boton.textContent = `Agregar · ${dinero(unitario * cantidad)}`;
  }

  function ponerCantidad(n) {
    cantidad = Math.min(CANTIDAD_MAXIMA, Math.max(1, n));
    valorCantidad.textContent = String(cantidad);
    menos.disabled = cantidad <= 1;
    mas.disabled = cantidad >= CANTIDAD_MAXIMA;
    errCantidad.textContent = '';
    actualizarPrecio();
  }

  function marcarError(campo, mensaje) {
    const fs = form.querySelector(`[data-campo="${campo}"]`);
    if (!fs) return;
    fs.querySelector('.error').textContent = mensaje || '';
    fs.classList.toggle('con-error', !!mensaje);
    for (const input of fs.querySelectorAll('input')) {
      if (mensaje) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  menos.addEventListener('click', () => ponerCantidad(cantidad - 1));
  mas.addEventListener('click', () => ponerCantidad(cantidad + 1));
  cerrar.addEventListener('click', () => cerrarDialogo(dialogo));
  form.addEventListener('change', (e) => {
    const fs = e.target.closest('[data-campo]');
    if (fs) marcarError(fs.dataset.campo, '');
    actualizarPrecio();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const eleccion = leerEleccion();
    const errores = validarEleccion(menu, categoria, producto, eleccion);
    for (const fs of form.querySelectorAll('[data-campo]')) marcarError(fs.dataset.campo, errores[fs.dataset.campo]);
    if (errores.cantidad) errCantidad.textContent = errores.cantidad;
    const primero = form.querySelector('.con-error');
    if (primero) {
      primero.scrollIntoView({ block: 'center' });
      (primero.querySelector('input:checked') || primero.querySelector('input')).focus({ preventScroll: true });
      return;
    }
    if (errores.cantidad) return;
    agregarAlPedido(eleccion);
    cerrarDialogo(dialogo);
  });

  dialogo.replaceChildren(form);
  dialogo.setAttribute('aria-labelledby', 'hoja-titulo');
  ponerCantidad(1);
  abrirDialogo(dialogo, { origen });
  // El foco va al título para que se lea el nombre del producto, no a la primera opción
  titulo.setAttribute('tabindex', '-1');
  titulo.focus();
  form.querySelector('.hoja-cuerpo').scrollTop = 0;
}
