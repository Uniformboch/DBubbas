// Carrito en pantalla, formulario del cliente y envío por WhatsApp.
import { agregar, cambiarCantidad, limpiar, resumen, detalleLinea } from './lib/carrito.mjs';
import { validarCliente } from './lib/validacion.mjs';
import { construirMensaje, enlaceWhatsApp } from './lib/mensaje.mjs';
import { el, dinero, avisar, abrirDialogo, cerrarDialogo, cerrarAlTocarFondo } from './dom.mjs';

const CLAVE = 'dbubbas-pedido-v1';
const CAMPOS = ['nombre', 'entrega', 'direccion', 'notas'];

const $ = (id) => document.getElementById(id);
const panel = $('pedido');
const lugarEscritorio = $('pedido-lugar');
const dialogoPedido = $('hoja-pedido');
const confirmar = $('confirmar-envio');
const barra = $('barra-pedido');
const lista = $('lineas');
const vacio = $('pedido-vacio');
const total = $('pedido-total');
const form = $('form-pedido');
const campoDireccion = $('campo-direccion');
const escritorio = window.matchMedia('(min-width: 1024px)');

const estado = { app: null, lineas: [], cliente: { nombre: '', entrega: '', direccion: '', notas: '' }, url: '' };

// ---------- Guardado en el navegador (puede fallar en modo privado) ----------

function leerGuardado() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (!datos || typeof datos !== 'object') return;
    if (Array.isArray(datos.lineas)) estado.lineas = datos.lineas;
    for (const k of CAMPOS) if (typeof datos.cliente?.[k] === 'string') estado.cliente[k] = datos.cliente[k];
  } catch { /* sin guardado */ }
}

function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ lineas: estado.lineas, cliente: estado.cliente }));
  } catch { /* sin guardado */ }
}

// ---------- Dibujo ----------

function dibujar({ foco } = {}) {
  const { menu, temporada } = estado.app;
  const { piezas, total: suma } = resumen(menu, temporada, estado.lineas);

  lista.replaceChildren(...estado.lineas.map((l, i) => {
    const d = detalleLinea(menu, temporada, l);
    const detalle = [d.partes.join(', '), d.extras.length ? `+ ${d.extras.join(', ')}` : '']
      .filter(Boolean).join(' · ');
    return el('li', { class: 'linea' },
      el('div', { class: 'linea-info' },
        el('p', { class: 'linea-nombre' }, d.nombre),
        detalle ? el('p', { class: 'linea-detalle' }, detalle) : null),
      el('p', { class: 'linea-precio' }, dinero(d.total)),
      el('div', { class: 'contador', role: 'group', 'aria-label': `Cantidad de ${d.nombre}` },
        el('button', {
          type: 'button', class: 'contador-boton', dataset: { i: String(i), delta: '-1' },
          'aria-label': d.cantidad === 1 ? `Quitar ${d.nombre}` : `Quitar uno: ${d.nombre}`,
        }, '−'),
        el('span', { class: 'cantidad-valor' }, String(d.cantidad)),
        el('button', {
          type: 'button', class: 'contador-boton', dataset: { i: String(i), delta: '1' },
          'aria-label': `Agregar uno: ${d.nombre}`, disabled: d.cantidad >= 20,
        }, '+')));
  }));

  vacio.hidden = estado.lineas.length > 0;
  lista.hidden = estado.lineas.length === 0;
  total.hidden = estado.lineas.length === 0;
  total.replaceChildren('Total ', el('b', {}, dinero(suma)));

  barra.replaceChildren(
    el('span', { class: 'barra-piezas' }, String(piezas)),
    el('span', {}, 'Ver pedido'),
    el('b', {}, dinero(suma)));
  barra.setAttribute('aria-label', `Ver pedido: ${piezas} ${piezas === 1 ? 'producto' : 'productos'}, ${dinero(suma)}`);
  barra.hidden = escritorio.matches || estado.lineas.length === 0;
  document.body.classList.toggle('con-barra', !barra.hidden);

  if (foco) foco();
}

function ubicarPanel() {
  if (escritorio.matches) {
    if (dialogoPedido.open) cerrarDialogo(dialogoPedido);
    lugarEscritorio.append(panel);
  } else {
    dialogoPedido.append(panel);
  }
  if (estado.app?.menu) dibujar();
}

// ---------- Formulario ----------

function llenarFormulario() {
  form.elements.nombre.value = estado.cliente.nombre;
  form.elements.direccion.value = estado.cliente.direccion;
  form.elements.notas.value = estado.cliente.notas;
  for (const r of form.querySelectorAll('input[name="entrega"]')) r.checked = r.value === estado.cliente.entrega;
  campoDireccion.hidden = estado.cliente.entrega !== 'domicilio';
}

function leerFormulario() {
  estado.cliente = {
    nombre: form.elements.nombre.value,
    entrega: form.querySelector('input[name="entrega"]:checked')?.value || '',
    direccion: form.elements.direccion.value,
    notas: form.elements.notas.value,
  };
}

function mostrarError(campo, mensaje) {
  const p = $(`error-${campo}`);
  if (p) p.textContent = mensaje || '';
  const controles = campo === 'entrega'
    ? form.querySelectorAll('input[name="entrega"]')
    : [form.elements[campo]].filter(Boolean);
  for (const c of controles) {
    if (mensaje) c.setAttribute('aria-invalid', 'true');
    else c.removeAttribute('aria-invalid');
  }
}

function enviar(e) {
  e.preventDefault();
  leerFormulario();
  const { menu, temporada } = estado.app;
  estado.lineas = limpiar(menu, temporada, estado.lineas);
  const errores = validarCliente(estado.cliente, estado.lineas);
  for (const c of ['carrito', ...CAMPOS]) mostrarError(c, errores[c]);
  dibujar();
  const primero = Object.keys(errores)[0];
  if (primero) {
    const destino = primero === 'carrito'
      ? $('pedido-titulo')
      : primero === 'entrega' ? form.querySelector('input[name="entrega"]') : form.elements[primero];
    if (primero === 'carrito') destino.setAttribute('tabindex', '-1');
    destino.focus();
    avisar('Revisa los datos marcados.');
    return;
  }
  guardar();
  const texto = construirMensaje(menu, temporada, estado.lineas, estado.cliente);
  estado.url = enlaceWhatsApp(menu.config.whatsapp, texto);
  abrirWhatsApp();
  abrirDialogo(confirmar, { foco: $('envio-listo'), origen: form.querySelector('[type=submit]') });
}

function abrirWhatsApp() {
  const ventana = window.open(estado.url, '_blank');
  if (ventana) ventana.opener = null;
  else window.location.href = estado.url; // si el navegador bloqueó la ventana nueva
}

// ---------- API para el resto de la página ----------

export function agregarAlPedido(eleccion) {
  const { menu, temporada } = estado.app;
  estado.lineas = limpiar(menu, temporada, agregar(estado.lineas, eleccion));
  guardar();
  mostrarError('carrito', '');
  dibujar();
  const d = detalleLinea(menu, temporada, { ...eleccion });
  avisar(`Agregado: ${eleccion.cantidad} × ${d ? d.nombre : 'producto'}`);
}

export function menuCargado(app) {
  estado.app = app;
  // El menú pudo cambiar desde la última visita: se descartan las líneas que ya no aplican
  estado.lineas = limpiar(app.menu, app.temporada, estado.lineas);
  guardar();
  dibujar();
}

export function iniciarPedido(app) {
  estado.app = app;
  leerGuardado();
  llenarFormulario();
  ubicarPanel();
  escritorio.addEventListener('change', ubicarPanel);
  cerrarAlTocarFondo(dialogoPedido);
  cerrarAlTocarFondo(confirmar);

  barra.addEventListener('click', () => abrirDialogo(dialogoPedido, { foco: $('pedido-titulo'), origen: barra }));
  panel.querySelector('[data-cerrar-pedido]').addEventListener('click', () => cerrarDialogo(dialogoPedido));

  lista.addEventListener('click', (e) => {
    const b = e.target.closest('.contador-boton');
    if (!b) return;
    const i = Number(b.dataset.i);
    const delta = Number(b.dataset.delta);
    const antes = estado.lineas.length;
    estado.lineas = cambiarCantidad(estado.lineas, i, delta);
    guardar();
    dibujar({
      foco: () => {
        // Mantener el foco en el mismo botón; si la línea se quitó, ir a la siguiente o al título
        if (estado.lineas.length === antes) {
          lista.querySelector(`[data-i="${i}"][data-delta="${delta}"]`)?.focus();
        } else {
          const sig = lista.querySelectorAll('.linea')[Math.min(i, estado.lineas.length - 1)];
          if (sig) sig.querySelector('.contador-boton').focus();
          else { $('pedido-titulo').setAttribute('tabindex', '-1'); $('pedido-titulo').focus(); }
          avisar('Producto quitado del pedido.');
        }
      },
    });
  });

  form.addEventListener('input', (e) => {
    leerFormulario();
    campoDireccion.hidden = estado.cliente.entrega !== 'domicilio';
    if (e.target.name) mostrarError(e.target.name, '');
    guardar();
  });
  form.addEventListener('submit', enviar);

  $('envio-listo').addEventListener('click', () => {
    estado.lineas = [];
    estado.cliente.notas = '';
    form.elements.notas.value = '';
    guardar();
    dibujar();
    cerrarDialogo(confirmar);
    if (dialogoPedido.open) cerrarDialogo(dialogoPedido);
    avisar('Listo. Puedes empezar otro pedido.');
    document.getElementById('menu').focus();
  });
  $('envio-abrir').addEventListener('click', abrirWhatsApp);
  $('envio-volver').addEventListener('click', () => cerrarDialogo(confirmar));
}
