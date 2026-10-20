// Panel del dueño: entrar, editar el menú en un borrador y guardarlo.
// Nada se publica hasta tocar "Guardar".
import { el, dinero, avisar, abrirDialogo, cerrarDialogo, cerrarAlTocarFondo } from './dom.mjs';
import { validarEstado, LIMITES_MENU } from './lib/validar-menu.mjs';
import { asignarIds } from './lib/ids.mjs';

const $ = (id) => document.getElementById(id);
const VISTAS = ['vista-cargando', 'vista-sin-config', 'vista-entrar', 'vista-editor'];
const PESTANAS = ['bebidas', 'comida', 'temporada', 'extras', 'ajustes'];

const p = { original: null, borrador: null, version: null, pestana: 'bebidas', guardando: false };
const clonar = (x) => structuredClone(x);
const sucio = () => p.borrador && JSON.stringify(p.borrador) !== JSON.stringify(p.original);

// ---------- Comunicación con el servidor ----------

class SesionVencida extends Error {}

async function api(metodo, ruta, { cuerpo, crudo, tipo } = {}) {
  const headers = { 'X-Menu': '1' };
  let body;
  if (cuerpo !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(cuerpo); }
  if (crudo !== undefined) { headers['Content-Type'] = tipo || 'application/octet-stream'; body = crudo; }
  let res;
  try {
    res = await fetch(ruta, { method: metodo, headers, body, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new Error('No hay conexión. Revisa tu internet e intenta de nuevo.');
  }
  let datos = {};
  try { datos = await res.json(); } catch { /* sin cuerpo */ }
  return { estado: res.status, datos };
}

/** Ejecuta una acción; si la sesión venció, pide la contraseña y la repite (sin perder cambios). */
async function conSesion(accion) {
  for (;;) {
    try {
      return await accion();
    } catch (err) {
      if (!(err instanceof SesionVencida)) throw err;
      const ok = await pedirContrasenaOtraVez();
      if (!ok) return null;
    }
  }
}

function revisar(r) {
  if (r.estado === 401) throw new SesionVencida();
  return r;
}

// ---------- Vistas ----------

function mostrarVista(id) {
  for (const v of VISTAS) $(v).hidden = v !== id;
}

async function arrancar() {
  let r;
  try { r = await api('GET', '/api/sesion'); } catch (err) {
    $('vista-cargando').replaceChildren(el('p', { role: 'alert' }, err.message));
    return;
  }
  if (!r.datos.configurado) return mostrarVista('vista-sin-config');
  if (!r.datos.autenticado) {
    mostrarVista('vista-entrar');
    $('contrasena').focus();
    return;
  }
  await cargarMenu();
}

async function entrar(contrasena, errorEl) {
  errorEl.textContent = '';
  if (!contrasena) { errorEl.textContent = 'Escribe la contraseña.'; return false; }
  let r;
  try { r = await api('POST', '/api/login', { cuerpo: { contrasena } }); } catch (err) {
    errorEl.textContent = err.message; return false;
  }
  if (r.estado === 200) return true;
  errorEl.textContent = r.datos.error || 'No se pudo entrar.';
  return false;
}

async function cargarMenu() {
  const r = revisar(await api('GET', '/api/menu'));
  if (r.estado !== 200) throw new Error(r.datos.error || 'No se pudo cargar el menú.');
  const { version, ...estado } = r.datos;
  p.original = estado;
  p.borrador = clonar(estado);
  p.version = version;
  ocultarAviso();
  mostrarVista('vista-editor');
  dibujarTodo();
}

function pedirContrasenaOtraVez() {
  return new Promise((resolver) => {
    const d = $('dialogo-entrar');
    const form = $('form-reentrar');
    const err = $('error-reentrar');
    err.textContent = '';
    form.reset();
    const terminar = (ok) => {
      form.removeEventListener('submit', alEnviar);
      $('reentrar-cancelar').removeEventListener('click', alCancelar);
      d.removeEventListener('cancel', alCancelar);
      cerrarDialogo(d);
      resolver(ok);
    };
    const alEnviar = async (e) => {
      e.preventDefault();
      if (await entrar(form.elements.contrasena.value, err)) terminar(true);
    };
    const alCancelar = (e) => { e?.preventDefault?.(); terminar(false); };
    form.addEventListener('submit', alEnviar);
    $('reentrar-cancelar').addEventListener('click', alCancelar);
    d.addEventListener('cancel', alCancelar);
    abrirDialogo(d, { foco: $('contrasena-2') });
  });
}

/** Ventana de confirmación. Devuelve true si se acepta. */
function confirmar({ titulo, texto, si }) {
  return new Promise((resolver) => {
    const d = $('dialogo-confirmar');
    $('confirmar-titulo').textContent = titulo;
    $('confirmar-texto').textContent = texto;
    $('confirmar-si').textContent = si;
    const terminar = (ok) => {
      $('confirmar-si').removeEventListener('click', alSi);
      $('confirmar-no').removeEventListener('click', alNo);
      d.removeEventListener('close', alNo);
      cerrarDialogo(d);
      resolver(ok);
    };
    const alSi = () => terminar(true);
    const alNo = () => terminar(false);
    $('confirmar-si').addEventListener('click', alSi);
    $('confirmar-no').addEventListener('click', alNo);
    d.addEventListener('close', alNo);
    abrirDialogo(d, { foco: $('confirmar-no') });
  });
}

// ---------- Avisos ----------

function mostrarAviso(titulo, { lista = [], boton } = {}) {
  const a = $('aviso-panel');
  a.replaceChildren(...[
    el('p', { class: 'aviso-panel-titulo' }, titulo),
    lista.length ? el('ul', {}, lista.slice(0, 12).map((t) => el('li', {}, t))) : null,
    lista.length > 12 ? el('p', {}, `…y ${lista.length - 12} más.`) : null,
    boton ? el('button', { type: 'button', class: 'boton-secundario', onclick: boton.accion }, boton.texto) : null,
  ].filter(Boolean));
  a.setAttribute('role', 'alert');
  a.hidden = false;
  a.scrollIntoView({ block: 'nearest' });
}
function ocultarAviso() { $('aviso-panel').hidden = true; }

function actualizarBarra() {
  const hay = sucio();
  $('barra-guardar').hidden = !hay;
  document.body.classList.toggle('con-barra-guardar', hay);
}

// ---------- Guardar ----------

async function guardar() {
  if (p.guardando) return;
  asignarIds(p.borrador);
  const errores = validarEstado(p.borrador);
  if (errores.length) {
    mostrarAviso('Corrige esto antes de guardar:', { lista: errores });
    return;
  }
  p.guardando = true;
  $('guardar').disabled = true;
  $('guardar').textContent = 'Guardando…';
  try {
    const r = await conSesion(async () => revisar(await api('PUT', '/api/menu', { cuerpo: { ...p.borrador, version: p.version } })));
    if (!r) return;
    if (r.estado === 200) {
      p.version = r.datos.version;
      p.original = clonar(p.borrador);
      ocultarAviso();
      actualizarBarra();
      avisar('Guardado. Ya se ve en el menú.');
    } else if (r.estado === 409) {
      avisoConflicto();
    } else if (r.estado === 422) {
      mostrarAviso(r.datos.error, { lista: r.datos.errores || [] });
    } else {
      mostrarAviso(r.datos.error || 'No se pudo guardar. Intenta de nuevo.');
    }
  } catch (err) {
    mostrarAviso(err.message);
  } finally {
    p.guardando = false;
    $('guardar').disabled = false;
    $('guardar').textContent = 'Guardar';
  }
}

function avisoConflicto() {
  mostrarAviso('El menú se cambió desde otro dispositivo.', {
    boton: { texto: 'Recargar la versión actual', accion: recargar },
  });
}

async function recargar() {
  if (sucio() && !(await confirmar({
    titulo: '¿Recargar el menú?', texto: 'Se perderán los cambios que no has guardado en este dispositivo.', si: 'Sí, recargar',
  }))) return;
  try { await conSesion(cargarMenu); } catch (err) { mostrarAviso(err.message); }
}

async function descartar() {
  if (!(await confirmar({ titulo: '¿Descartar los cambios?', texto: 'El menú queda como estaba la última vez que se guardó.', si: 'Sí, descartar' }))) return;
  p.borrador = clonar(p.original);
  ocultarAviso();
  dibujarTodo();
  avisar('Cambios descartados.');
}

// ---------- Utilidades de formulario ----------

let contadorCampos = 0;
const nuevoId = () => `c${++contadorCampos}`;

function campoTexto({ etiqueta, valor = '', max, multilinea = false, ayuda, alCambiar, atributos = {} }) {
  const id = nuevoId();
  const control = el(multilinea ? 'textarea' : 'input', {
    id, maxlength: String(max), ...(multilinea ? { rows: '2' } : { type: 'text' }), ...atributos,
  });
  control.value = valor;
  if (alCambiar) control.addEventListener('input', () => alCambiar(control.value));
  return el('div', { class: 'campo' },
    el('label', { for: id }, etiqueta, ayuda ? el('span', { class: 'opcional' }, ` ${ayuda}`) : null),
    control);
}

/** Texto de precio a número entero; null si está vacío. */
function leerPrecio(texto) {
  const t = String(texto).trim().replace(/^\$/, '');
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

function campoPrecio({ etiqueta, valor, alCambiar, vacioPermitido = true }) {
  const id = nuevoId();
  const input = el('input', {
    id, type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '4',
    class: 'input-precio', placeholder: vacioPermitido ? '—' : '0',
  });
  input.value = valor == null ? '' : String(valor);
  input.addEventListener('input', () => alCambiar(leerPrecio(input.value)));
  return el('div', { class: 'campo campo-precio' },
    el('label', { for: id }, etiqueta),
    el('div', { class: 'precio-con-signo' }, el('span', { 'aria-hidden': 'true' }, '$'), input));
}

function interruptor({ etiqueta, activo, alCambiar, clase = '' }) {
  const b = el('button', { type: 'button', role: 'switch', class: `interruptor ${clase}`, 'aria-checked': String(!!activo) },
    el('span', { class: 'interruptor-pista', 'aria-hidden': 'true' }),
    el('span', { class: 'interruptor-texto' }, etiqueta));
  b.addEventListener('click', () => {
    const nuevo = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(nuevo));
    alCambiar(nuevo);
  });
  return b;
}

const resumenPrecios = (menu, prod) => Object.entries(prod.precios || {})
  .map(([t, v]) => (t === 'unico' ? dinero(v) : `${menu.tamanos[t]?.nombre || t} ${dinero(v)}`)).join(' · ');

// ---------- Editor de opciones (grupos con valores) ----------

function editorOpciones(lista, alCambiar) {
  const caja = el('div', { class: 'editor-opciones' });
  const dibujar = () => {
    caja.replaceChildren(
      ...lista.map((g, gi) => el('fieldset', { class: 'grupo-editar' },
        el('legend', {}, g.nombre || `Opción ${gi + 1}`),
        campoTexto({
          etiqueta: 'Nombre de la opción', valor: g.nombre, max: LIMITES_MENU.nombre,
          atributos: { placeholder: 'ej. Salsa' },
          alCambiar: (v) => { g.nombre = v; caja.querySelectorAll('.grupo-editar > legend')[gi].textContent = v || `Opción ${gi + 1}`; alCambiar(); },
        }),
        el('p', { class: 'nota' }, `De ${LIMITES_MENU.valoresMin} a ${LIMITES_MENU.valoresMax} valores. El cliente elige uno.`),
        el('ul', { class: 'valores' }, g.valores.map((v, vi) => el('li', { class: 'valor' },
          campoTexto({ etiqueta: `Valor ${vi + 1}`, valor: v.nombre, max: LIMITES_MENU.nombre, alCambiar: (x) => { v.nombre = x; alCambiar(); } }),
          campoPrecio({
            etiqueta: 'Precio extra', valor: v.precio,
            alCambiar: (x) => { if (x == null) delete v.precio; else v.precio = x; alCambiar(); },
          }),
          el('button', {
            type: 'button', class: 'boton-icono', 'aria-label': `Quitar ${v.nombre || `valor ${vi + 1}`}`,
            disabled: g.valores.length <= 1,
            onclick: () => { g.valores.splice(vi, 1); alCambiar(); dibujar(); caja.querySelectorAll('.grupo-editar')[gi]?.querySelector('.agregar-valor')?.focus(); },
          }, '×')))),
        el('div', { class: 'fila-botones' },
          el('button', {
            type: 'button', class: 'boton-chico agregar-valor', disabled: g.valores.length >= LIMITES_MENU.valoresMax,
            onclick: () => {
              g.valores.push({ nombre: '' }); alCambiar(); dibujar();
              const inputs = caja.querySelectorAll('.grupo-editar')[gi].querySelectorAll('.valor input[type=text]:not(.input-precio)');
              inputs[inputs.length - 1]?.focus();
            },
          }, '+ Agregar valor'),
          el('button', {
            type: 'button', class: 'boton-chico peligro',
            onclick: () => { lista.splice(gi, 1); alCambiar(); dibujar(); caja.querySelector('.agregar-opcion')?.focus(); },
          }, 'Quitar esta opción')))),
      el('button', {
        type: 'button', class: 'boton-chico agregar-opcion', disabled: lista.length >= LIMITES_MENU.grupos,
        onclick: () => {
          lista.push({ nombre: '', valores: [{ nombre: '' }, { nombre: '' }] }); alCambiar(); dibujar();
          caja.querySelectorAll('.grupo-editar')[lista.length - 1]?.querySelector('input')?.focus();
        },
      }, '+ Agregar opción obligatoria'),
    );
  };
  dibujar();
  return caja;
}

// ---------- Pestañas Bebidas / Postres ----------

function dibujarGrupo(grupo) {
  const tab = $(`tab-${grupo}`);
  const { menu } = p.borrador;
  const cats = menu.categorias.filter((c) => c.grupo === grupo);
  tab.replaceChildren(...cats.map((c) => el('section', { class: 'p-cat', 'aria-labelledby': `pc-${c.id}` },
    el('h2', { class: 'p-cat-titulo', id: `pc-${c.id}` }, c.nombre),
    Array.isArray(c.opciones) && c.opciones.length
      ? el('details', { class: 'p-opciones-cat' },
        el('summary', {}, `Opciones de toda la sección: ${c.opciones.map((g) => g.nombre).join(', ')}`),
        el('p', { class: 'nota' }, 'Aplican a todos los productos de la sección, salvo los que tengan opciones propias.'),
        editorOpciones(c.opciones, actualizarBarra))
      : null,
    el('ul', { class: 'p-lista' }, c.productos.map((prod) => filaProducto(c, prod))),
    el('button', {
      type: 'button', class: 'boton-secundario boton-agregar', dataset: { agregar: c.id },
      onclick: () => abrirEditor({ categoria: c, producto: null }),
    }, `+ Agregar producto en ${c.nombre}`))));
}

function filaProducto(c, prod) {
  const { menu } = p.borrador;
  return el('li', { class: `p-prod${prod.agotado ? ' es-agotado' : ''}` },
    el('div', { class: 'p-prod-info' },
      el('span', { class: 'p-prod-nombre' }, prod.nombre || '(sin nombre)'),
      el('span', { class: 'p-prod-precios' }, resumenPrecios(menu, prod)),
      prod.disponible === false ? el('span', { class: 'etiqueta-oculto' }, 'Oculto') : null),
    interruptor({
      etiqueta: 'Agotado', activo: prod.agotado, clase: 'interruptor-agotado',
      alCambiar: (v) => {
        if (v) prod.agotado = true; else delete prod.agotado;
        actualizarBarra();
        avisar(`${prod.nombre}: ${v ? 'agotado' : 'disponible'} (falta guardar)`);
      },
    }),
    el('button', {
      type: 'button', class: 'boton-chico', dataset: { editar: prod.id || '' }, 'aria-label': `Editar ${prod.nombre}`,
      onclick: (e) => abrirEditor({ categoria: c, producto: prod, origen: e.currentTarget }),
    }, 'Editar'));
}

// ---------- Editor de producto ----------

function abrirEditor({ categoria, producto, origen, temporada = false }) {
  const { menu } = p.borrador;
  const nuevo = !producto;
  const trabajo = producto ? clonar(producto) : { nombre: '', precios: temporada ? { unico: null } : {} };
  // Solo los tamaños que ya usa la sección (si no usa ninguno, todos)
  const usados = new Set(categoria.productos.flatMap((x) => Object.keys(x.precios || {})));
  const enSeccion = Object.keys(menu.tamanos).filter((t) => usados.has(t) || t in trabajo.precios);
  const tamanos = enSeccion.length ? enSeccion : Object.keys(menu.tamanos);
  const indice = producto ? categoria.productos.indexOf(producto) : categoria.productos.length;
  let posicion = indice;
  const errores = el('div', { class: 'aviso-panel', hidden: true, role: 'alert' });

  // --- Precio
  let modoPrecio = 'unico' in trabajo.precios || temporada ? 'unico' : (Object.keys(trabajo.precios).length ? 'tamanos' : 'tamanos');
  const cajaPrecio = el('div', { class: 'precios-editar' });
  const dibujarPrecio = () => {
    cajaPrecio.replaceChildren(...(modoPrecio === 'unico'
      ? [campoPrecio({ etiqueta: 'Precio', valor: trabajo.precios.unico, alCambiar: (v) => { trabajo.precios = { unico: v }; } })]
      : tamanos.map((t) => campoPrecio({
        etiqueta: menu.tamanos[t].nombre, valor: trabajo.precios[t],
        alCambiar: (v) => { if (v == null) delete trabajo.precios[t]; else trabajo.precios[t] = v; },
      }))));
  };
  const radiosPrecio = temporada ? null : el('fieldset', { class: 'campo' },
    el('legend', {}, 'Precio'),
    ...[['tamanos', 'Por tamaño (deja vacío el que no se vende)'], ['unico', 'Precio único']].map(([valor, texto]) => {
      const input = el('input', { type: 'radio', name: 'modo-precio', value: valor });
      input.checked = modoPrecio === valor;
      input.addEventListener('change', () => {
        modoPrecio = valor;
        const primero = Object.values(trabajo.precios).find(Number.isInteger) ?? null;
        trabajo.precios = valor === 'unico' ? { unico: primero } : {};
        dibujarPrecio();
      });
      return el('label', { class: 'opcion' }, input, el('span', { class: 'opcion-nombre' }, texto));
    }));
  dibujarPrecio();

  // --- Extras
  let cajaExtras = null;
  if (!temporada) {
    const deSeccion = (categoria.extrasPermitidos || []).map((id) => menu.extras.find((x) => x.id === id)?.nombre).filter(Boolean);
    let propios = Array.isArray(trabajo.extrasPermitidos);
    const lista = el('div', { class: 'opciones' });
    const dibujarLista = () => {
      lista.hidden = !propios;
      lista.replaceChildren(...menu.extras.map((x) => {
        const c = el('input', { type: 'checkbox', value: x.id });
        c.checked = propios && trabajo.extrasPermitidos.includes(x.id);
        c.addEventListener('change', () => {
          trabajo.extrasPermitidos = menu.extras.map((e) => e.id).filter((id) => (id === x.id ? c.checked : trabajo.extrasPermitidos.includes(id)));
        });
        return el('label', { class: 'opcion' }, c, el('span', { class: 'opcion-nombre' }, x.nombre), el('span', { class: 'opcion-precio' }, `+${dinero(x.precio)}`));
      }));
    };
    const radio = (valor, texto) => {
      const input = el('input', { type: 'radio', name: 'modo-extras', value: valor });
      input.checked = (valor === 'propios') === propios;
      input.addEventListener('change', () => {
        propios = valor === 'propios';
        if (propios) trabajo.extrasPermitidos = [...(categoria.extrasPermitidos || [])];
        else delete trabajo.extrasPermitidos;
        dibujarLista();
      });
      return el('label', { class: 'opcion' }, input, el('span', { class: 'opcion-nombre' }, texto));
    };
    cajaExtras = el('fieldset', { class: 'campo' },
      el('legend', {}, 'Extras que se ofrecen'),
      radio('seccion', deSeccion.length ? `Los de la sección (${deSeccion.length})` : 'Los de la sección (ninguno)'),
      radio('propios', 'Elegir para este producto'),
      lista);
    dibujarLista();
  }

  // --- Opciones obligatorias
  let cajaOpciones = null;
  if (!temporada) {
    const deSeccion = Array.isArray(categoria.opciones) && categoria.opciones.length;
    let propias = Array.isArray(trabajo.opciones);
    const editor = el('div');
    const dibujarOpciones = () => {
      editor.replaceChildren();
      if (propias || !deSeccion) {
        if (!Array.isArray(trabajo.opciones)) trabajo.opciones = [];
        editor.append(editorOpciones(trabajo.opciones, () => {}));
      }
    };
    const radios = deSeccion ? ['seccion', 'propias'].map((valor) => {
      const input = el('input', { type: 'radio', name: 'modo-opciones', value: valor });
      input.checked = (valor === 'propias') === propias;
      input.addEventListener('change', () => {
        propias = valor === 'propias';
        if (propias) trabajo.opciones = clonar(categoria.opciones).map(({ id, ...g }) => ({ ...g, valores: g.valores.map(({ id: _i, ...v }) => v) }));
        else delete trabajo.opciones;
        dibujarOpciones();
      });
      return el('label', { class: 'opcion' }, input, el('span', { class: 'opcion-nombre' },
        valor === 'seccion' ? `Las de la sección (${categoria.opciones.map((g) => g.nombre).join(', ')})` : 'Propias de este producto'));
    }) : [];
    cajaOpciones = el('fieldset', { class: 'campo' },
      el('legend', {}, 'Opciones a elegir'),
      el('p', { class: 'nota' }, 'El cliente debe elegir un valor de cada opción. Un valor puede sumar precio.'),
      ...radios, editor);
    dibujarOpciones();
  }

  // --- Foto (temporada)
  let cajaFoto = null;
  if (temporada) {
    const vista = el('img', { class: 'foto-vista', alt: '', hidden: !trabajo.imagen });
    if (trabajo.imagen) vista.src = trabajo.imagen;
    const estadoFoto = el('p', { class: 'nota', role: 'status' });
    const idArchivo = nuevoId();
    const archivo = el('input', { id: idArchivo, type: 'file', accept: 'image/jpeg,image/png,image/webp,image/*', class: 'input-archivo' });
    const quitar = el('button', { type: 'button', class: 'boton-chico peligro', hidden: !trabajo.imagen }, 'Quitar foto');
    quitar.addEventListener('click', () => { delete trabajo.imagen; vista.hidden = true; quitar.hidden = true; estadoFoto.textContent = 'Foto quitada.'; });
    archivo.addEventListener('change', async () => {
      const f = archivo.files[0];
      if (!f) return;
      estadoFoto.textContent = 'Preparando la foto…';
      try {
        const jpg = await reducirFoto(f);
        estadoFoto.textContent = 'Subiendo la foto…';
        const r = await conSesion(async () => revisar(await api('POST', '/api/imagen', { crudo: jpg, tipo: 'image/jpeg' })));
        if (!r) { estadoFoto.textContent = 'No se subió la foto.'; return; }
        if (r.estado !== 201) { estadoFoto.textContent = r.datos.error || 'No se pudo subir la foto.'; return; }
        trabajo.imagen = r.datos.url;
        vista.src = r.datos.url; vista.hidden = false; quitar.hidden = false;
        estadoFoto.textContent = 'Foto lista (se publica al guardar).';
      } catch (err) {
        estadoFoto.textContent = err.message || 'No se pudo leer la foto.';
      } finally {
        archivo.value = '';
      }
    });
    cajaFoto = el('div', { class: 'campo' },
      el('span', { class: 'campo-etiqueta' }, 'Foto'),
      vista,
      el('label', { for: idArchivo, class: 'boton-secundario boton-archivo' }, trabajo.imagen ? 'Cambiar foto' : 'Tomar o elegir foto'),
      archivo, quitar, estadoFoto);
  }

  // --- Lugar en la lista
  const total = categoria.productos.length + (nuevo ? 1 : 0);
  const idLugar = nuevoId();
  const lugar = el('select', { id: idLugar }, Array.from({ length: total }, (_, i) => {
    const o = el('option', { value: String(i) }, i === 0 ? '1 (primero)' : i === total - 1 ? `${i + 1} (último)` : String(i + 1));
    if (i === posicion) o.selected = true;
    return o;
  }));
  lugar.addEventListener('change', () => { posicion = Number(lugar.value); });

  // --- Visible
  const visible = temporada ? null : interruptor({
    etiqueta: 'Oculto del menú', activo: trabajo.disponible === false,
    alCambiar: (v) => { if (v) trabajo.disponible = false; else delete trabajo.disponible; },
  });

  const titulo = el('h2', { class: 'hoja-titulo', id: 'editor-titulo', tabindex: '-1' }, nuevo ? `Nuevo en ${categoria.nombre}` : `Editar ${producto.nombre}`);
  const form = el('form', { class: 'hoja-form', novalidate: true },
    el('header', { class: 'hoja-cabeza' }, titulo,
      el('button', { type: 'button', class: 'cerrar', 'aria-label': 'Cerrar sin cambios', onclick: () => cerrarDialogo($('editor')) }, '×')),
    el('div', { class: 'hoja-cuerpo' },
      errores,
      campoTexto({ etiqueta: 'Nombre', valor: trabajo.nombre, max: LIMITES_MENU.nombre, alCambiar: (v) => { trabajo.nombre = v; } }),
      temporada ? null : campoTexto({
        etiqueta: 'Detalle', ayuda: '(opcional, ej. 600 ml)', valor: trabajo.detalle || '', max: LIMITES_MENU.detalle,
        alCambiar: (v) => { if (v.trim()) trabajo.detalle = v; else delete trabajo.detalle; },
      }),
      campoTexto({
        etiqueta: 'Descripción', ayuda: '(opcional)', valor: trabajo.descripcion || '', max: LIMITES_MENU.descripcion, multilinea: true,
        alCambiar: (v) => { if (v.trim()) trabajo.descripcion = v; else delete trabajo.descripcion; },
      }),
      cajaFoto,
      radiosPrecio, cajaPrecio,
      cajaExtras, cajaOpciones,
      el('div', { class: 'campo' }, el('label', { for: idLugar }, 'Lugar en la lista'), lugar),
      visible,
      nuevo ? null : el('button', {
        type: 'button', class: 'boton-secundario peligro boton-eliminar',
        onclick: async () => {
          if (!(await confirmar({ titulo: `¿Eliminar ${producto.nombre}?`, texto: 'Se quita del menú cuando guardes.', si: 'Sí, eliminar' }))) return;
          categoria.productos.splice(categoria.productos.indexOf(producto), 1);
          cerrarDialogo($('editor'));
          actualizarBarra();
          dibujarTodo();
          avisar(`${producto.nombre} eliminado (falta guardar).`);
          document.querySelector(`[data-agregar="${categoria.id}"]`)?.focus();
        },
      }, 'Eliminar producto')),
    el('footer', { class: 'hoja-pie hoja-pie-panel' },
      el('button', { type: 'button', class: 'boton-secundario', onclick: () => cerrarDialogo($('editor')) }, 'Cancelar'),
      el('button', { type: 'submit', class: 'boton-principal' }, 'Listo')));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // Limpieza: sin precios vacíos y sin opciones vacías al final
    for (const [k, v] of Object.entries(trabajo.precios)) if (v == null) delete trabajo.precios[k];
    if (Array.isArray(trabajo.opciones) && !trabajo.opciones.length && !(Array.isArray(categoria.opciones) && categoria.opciones.length)) delete trabajo.opciones;
    const problemas = revisarProducto(trabajo, { temporada });
    if (problemas.length) {
      errores.replaceChildren(el('p', { class: 'aviso-panel-titulo' }, 'Revisa esto:'), el('ul', {}, problemas.map((t) => el('li', {}, t))));
      errores.hidden = false;
      errores.scrollIntoView({ block: 'nearest' });
      titulo.focus();
      return;
    }
    if (nuevo) categoria.productos.push(trabajo);
    else categoria.productos[indice] = trabajo;
    // Mover al lugar elegido
    const desde = nuevo ? categoria.productos.length - 1 : indice;
    const [movido] = categoria.productos.splice(desde, 1);
    categoria.productos.splice(posicion, 0, movido);
    asignarIds(p.borrador);
    cerrarDialogo($('editor'));
    actualizarBarra();
    dibujarTodo();
    avisar(`${trabajo.nombre}: listo (falta guardar).`);
    document.querySelector(`[data-editar="${trabajo.id}"]`)?.focus();
  });

  const d = $('editor');
  d.replaceChildren(form);
  abrirDialogo(d, { origen: origen || document.activeElement, foco: titulo });
}

/** Revisión rápida en el editor (el servidor revisa todo de nuevo al guardar). */
function revisarProducto(prod, { temporada }) {
  const t = [];
  const okPrecio = (v) => Number.isInteger(v) && v >= LIMITES_MENU.precioMin && v <= LIMITES_MENU.precioMax;
  if (!prod.nombre.trim()) t.push('Escribe el nombre.');
  const precios = Object.values(prod.precios);
  if (!precios.length) t.push('Pon al menos un precio.');
  if (precios.some((v) => !okPrecio(v))) t.push('Los precios deben ser números enteros de 1 a 9999.');
  if (temporada && !('unico' in prod.precios)) t.push('En temporada el precio es único.');
  for (const g of prod.opciones || []) {
    const nombre = g.nombre.trim() || 'sin nombre';
    if (!g.nombre.trim()) t.push('Cada opción necesita nombre.');
    if (g.valores.length < LIMITES_MENU.valoresMin || g.valores.length > LIMITES_MENU.valoresMax) t.push(`La opción "${nombre}" debe tener de 2 a 15 valores.`);
    if (g.valores.some((v) => !v.nombre.trim())) t.push(`La opción "${nombre}" tiene valores sin nombre.`);
    if (g.valores.some((v) => v.precio !== undefined && !okPrecio(v.precio))) t.push(`Los precios extra de "${nombre}" deben ser de 1 a 9999 (o vacío).`);
  }
  return t;
}

/** Reduce la foto a 1000 px en su lado mayor, en JPEG. */
async function reducirFoto(archivo) {
  if (archivo.size > 25 * 1024 * 1024) throw new Error('La foto es demasiado pesada.');
  let imagen;
  try { imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' }); } catch {
    throw new Error('Ese archivo no es una foto que se pueda leer.');
  }
  const escala = Math.min(1, 1000 / Math.max(imagen.width, imagen.height));
  const w = Math.round(imagen.width * escala);
  const h = Math.round(imagen.height * escala);
  const lienzo = document.createElement('canvas');
  lienzo.width = w; lienzo.height = h;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(imagen, 0, 0, w, h);
  imagen.close?.();
  const blob = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.82));
  if (!blob) throw new Error('No se pudo preparar la foto.');
  return blob;
}

// ---------- Pestaña Temporada ----------

function dibujarTemporada() {
  const tab = $('tab-temporada');
  const t = p.borrador.temporada;
  const c = t.categoria;
  tab.replaceChildren(el('section', { class: 'p-cat' },
    el('h2', { class: 'p-cat-titulo' }, 'Temporada'),
    interruptor({
      etiqueta: 'Mostrar la sección de temporada en el menú', activo: t.activa,
      alCambiar: (v) => { t.activa = v; actualizarBarra(); },
    }),
    campoTexto({ etiqueta: 'Nombre de la sección', valor: c.nombre, max: LIMITES_MENU.nombre, alCambiar: (v) => { c.nombre = v; actualizarBarra(); } }),
    c.productos.length ? null : el('p', { class: 'nota' }, 'Todavía no hay productos de temporada.'),
    el('ul', { class: 'p-lista' }, c.productos.map((prod) => el('li', { class: `p-prod${prod.agotado ? ' es-agotado' : ''}` },
      prod.imagen ? el('img', { class: 'p-prod-foto', src: prod.imagen, alt: '' }) : el('span', { class: 'p-prod-foto sin-foto', 'aria-hidden': 'true' }),
      el('div', { class: 'p-prod-info' },
        el('span', { class: 'p-prod-nombre' }, prod.nombre),
        el('span', { class: 'p-prod-precios' }, resumenPrecios(p.borrador.menu, prod))),
      interruptor({
        etiqueta: 'Agotado', activo: prod.agotado, clase: 'interruptor-agotado',
        alCambiar: (v) => { if (v) prod.agotado = true; else delete prod.agotado; actualizarBarra(); },
      }),
      el('button', {
        type: 'button', class: 'boton-chico', dataset: { editar: prod.id || '' }, 'aria-label': `Editar ${prod.nombre}`,
        onclick: (e) => abrirEditor({ categoria: c, producto: prod, origen: e.currentTarget, temporada: true }),
      }, 'Editar')))),
    el('button', {
      type: 'button', class: 'boton-secundario boton-agregar', dataset: { agregar: c.id },
      onclick: () => abrirEditor({ categoria: c, producto: null, temporada: true }),
    }, '+ Agregar producto de temporada')));
}

// ---------- Pestaña Extras ----------

function dibujarExtras() {
  const tab = $('tab-extras');
  const { menu } = p.borrador;
  tab.replaceChildren(el('section', { class: 'p-cat' },
    el('h2', { class: 'p-cat-titulo' }, 'Extras'),
    el('p', { class: 'nota' }, 'Cosas que el cliente puede agregar con costo. Elige en qué secciones se ofrecen.'),
    el('ul', { class: 'p-lista p-extras' }, menu.extras.map((x, i) => el('li', { class: 'p-extra' },
      el('fieldset', { class: 'grupo-editar' },
        el('legend', {}, x.nombre || `Extra ${i + 1}`),
        campoTexto({
          etiqueta: 'Nombre', valor: x.nombre, max: LIMITES_MENU.nombre,
          alCambiar: (v) => { x.nombre = v; tab.querySelectorAll('.p-extra legend')[i].textContent = v || `Extra ${i + 1}`; actualizarBarra(); },
        }),
        campoPrecio({ etiqueta: 'Precio', valor: x.precio, alCambiar: (v) => { x.precio = v; actualizarBarra(); } }),
        el('fieldset', { class: 'campo' },
          el('legend', {}, 'Se ofrece en'),
          el('div', { class: 'opciones opciones-2' }, menu.categorias.map((c) => {
            const cb = el('input', { type: 'checkbox' });
            cb.checked = (c.extrasPermitidos || []).includes(x.id);
            cb.addEventListener('change', () => {
              const lista = c.extrasPermitidos || (c.extrasPermitidos = []);
              if (cb.checked && !lista.includes(x.id)) {
                // En el orden de la lista de extras
                c.extrasPermitidos = menu.extras.map((e) => e.id).filter((id) => id === x.id || lista.includes(id));
              } else if (!cb.checked) c.extrasPermitidos = lista.filter((id) => id !== x.id);
              actualizarBarra();
            });
            return el('label', { class: 'opcion' }, cb, el('span', { class: 'opcion-nombre' }, c.nombre));
          }))),
        el('button', {
          type: 'button', class: 'boton-chico peligro',
          onclick: async () => {
            if (!(await confirmar({ titulo: `¿Eliminar ${x.nombre || 'este extra'}?`, texto: 'Se quita de todas las secciones y productos cuando guardes.', si: 'Sí, eliminar' }))) return;
            menu.extras.splice(menu.extras.indexOf(x), 1);
            const quitar = (lista) => (Array.isArray(lista) ? lista.filter((id) => id !== x.id) : lista);
            for (const c of menu.categorias) {
              if (c.extrasPermitidos) c.extrasPermitidos = quitar(c.extrasPermitidos);
              for (const prod of c.productos) if (prod.extrasPermitidos) prod.extrasPermitidos = quitar(prod.extrasPermitidos);
            }
            actualizarBarra();
            dibujarExtras();
            avisar('Extra eliminado (falta guardar).');
            $('agregar-extra').focus();
          },
        }, 'Eliminar extra'))))),
    el('button', {
      type: 'button', id: 'agregar-extra', class: 'boton-secundario boton-agregar',
      onclick: () => {
        menu.extras.push({ nombre: '', precio: null });
        actualizarBarra();
        dibujarExtras();
        const campos = $('tab-extras').querySelectorAll('.p-extra');
        campos[campos.length - 1].querySelector('input').focus();
      },
    }, '+ Agregar extra')));
}

// ---------- Pestaña Ajustes ----------

function dibujarAjustes() {
  const tab = $('tab-ajustes');
  const cfg = p.borrador.menu.config;
  const idTel = nuevoId();
  const tel = el('input', { id: idTel, type: 'tel', inputmode: 'numeric', autocomplete: 'off', maxlength: '10', 'aria-describedby': `${idTel}-ayuda`, class: 'input-tel' });
  tel.value = cfg.whatsapp.startsWith('52') ? cfg.whatsapp.slice(2) : cfg.whatsapp;
  const ayudaTel = el('p', { class: 'nota', id: `${idTel}-ayuda` }, '10 dígitos, sin espacios. La lada de México (+52) ya va incluida.');
  tel.addEventListener('input', () => {
    const digitos = tel.value.replace(/\D/g, '');
    cfg.whatsapp = `52${digitos}`;
    ayudaTel.textContent = digitos.length === 10 ? '10 dígitos, sin espacios. La lada de México (+52) ya va incluida.' : `Lleva ${digitos.length} de 10 dígitos.`;
    actualizarBarra();
  });

  const lista = el('ul', { class: 'p-lista p-respaldos' });
  const estadoResp = el('p', { class: 'nota', role: 'status' });
  const cargarRespaldos = async () => {
    estadoResp.textContent = 'Cargando respaldos…';
    try {
      const r = await conSesion(async () => revisar(await api('GET', '/api/respaldos')));
      if (!r) { estadoResp.textContent = ''; return; }
      const items = r.datos.respaldos || [];
      estadoResp.textContent = items.length ? `${items.length} respaldos (se guardan los últimos 60).` : 'Todavía no hay respaldos. Se crea uno cada vez que guardas.';
      lista.replaceChildren(...items.map((x) => el('li', { class: 'p-prod' },
        el('div', { class: 'p-prod-info' },
          el('span', { class: 'p-prod-nombre' }, new Date(x.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })),
          el('span', { class: 'p-prod-precios' }, `${x.motivo === 'restaurar' ? 'Antes de restaurar' : 'Antes de guardar'} · ${x.productos} productos`)),
        el('button', { type: 'button', class: 'boton-chico', onclick: () => restaurar(x) }, 'Restaurar'))));
    } catch (err) { estadoResp.textContent = err.message; }
  };

  tab.replaceChildren(
    el('section', { class: 'p-cat' },
      el('h2', { class: 'p-cat-titulo' }, 'Pedidos'),
      el('div', { class: 'campo' },
        el('label', { for: idTel }, 'WhatsApp para pedidos'),
        el('div', { class: 'tel-con-lada' }, el('span', {}, '+52'), tel),
        ayudaTel),
      campoTexto({ etiqueta: 'Nombre en el mensaje', valor: cfg.negocio, max: LIMITES_MENU.nombre, alCambiar: (v) => { cfg.negocio = v; actualizarBarra(); } })),
    el('section', { class: 'p-cat' },
      el('h2', { class: 'p-cat-titulo' }, 'Respaldos'),
      el('p', { class: 'nota' }, 'Antes de cada guardado se guarda una copia de cómo estaba el menú. Puedes regresar a una de ellas.'),
      el('button', { type: 'button', class: 'boton-secundario', onclick: cargarRespaldos }, 'Ver respaldos'),
      estadoResp, lista),
    el('section', { class: 'p-cat' },
      el('h2', { class: 'p-cat-titulo' }, 'Sesión'),
      el('button', { type: 'button', class: 'boton-secundario', onclick: salir }, 'Cerrar sesión')));
}

async function restaurar(respaldo) {
  const fecha = new Date(respaldo.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  const ok = await confirmar({
    titulo: '¿Restaurar este respaldo?',
    texto: `El menú publicado regresa a como estaba (${fecha}).${sucio() ? ' Los cambios que no has guardado se perderán.' : ''} Lo de ahora queda en un respaldo nuevo.`,
    si: 'Sí, restaurar',
  });
  if (!ok) return;
  try {
    const r = await conSesion(async () => revisar(await api('POST', '/api/respaldos/restaurar', { cuerpo: { id: respaldo.id, version: p.version } })));
    if (!r) return;
    if (r.estado === 200) {
      await conSesion(cargarMenu);
      p.pestana = 'ajustes';
      mostrarPestana('ajustes');
      avisar('Respaldo restaurado. Ya se ve en el menú.');
    } else if (r.estado === 409) avisoConflicto();
    else mostrarAviso(r.datos.error || 'No se pudo restaurar.', { lista: r.datos.errores || [] });
  } catch (err) { mostrarAviso(err.message); }
}

async function salir() {
  if (sucio() && !(await confirmar({ titulo: '¿Salir sin guardar?', texto: 'Se perderán los cambios que no has guardado.', si: 'Sí, salir' }))) return;
  try { await api('POST', '/api/logout'); } catch { /* igual se sale */ }
  p.original = null; p.borrador = null;
  actualizarBarra();
  $('form-entrar').reset();
  mostrarVista('vista-entrar');
  $('contrasena').focus();
}

// ---------- Pestañas ----------

function dibujarTodo() {
  dibujarGrupo('bebidas');
  dibujarGrupo('comida');
  dibujarTemporada();
  dibujarExtras();
  dibujarAjustes();
  mostrarPestana(p.pestana);
  actualizarBarra();
}

function mostrarPestana(nombre, { enfocar = false } = {}) {
  p.pestana = nombre;
  for (const n of PESTANAS) {
    const b = $(`pes-${n}`);
    const activa = n === nombre;
    b.setAttribute('aria-selected', String(activa));
    b.tabIndex = activa ? 0 : -1;
    $(`tab-${n}`).hidden = !activa;
  }
  if (enfocar) $(`pes-${nombre}`).focus();
}

document.querySelector('[role="tablist"]').addEventListener('click', (e) => {
  const b = e.target.closest('[role="tab"]');
  if (b) mostrarPestana(b.id.replace('pes-', ''));
});
document.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
  const i = PESTANAS.indexOf(p.pestana);
  const mover = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: PESTANAS.length - 1 - i }[e.key];
  if (mover === undefined) return;
  e.preventDefault();
  mostrarPestana(PESTANAS[(i + mover + PESTANAS.length) % PESTANAS.length], { enfocar: true });
});

// ---------- Arranque ----------

$('form-entrar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = e.target.querySelector('[type=submit]');
  boton.disabled = true;
  try {
    if (await entrar($('contrasena').value, $('error-entrar'))) {
      $('form-entrar').reset();
      await cargarMenu();
      $('panel-main').focus();
    } else {
      $('contrasena').focus();
    }
  } catch (err) {
    $('error-entrar').textContent = err.message;
  } finally {
    boton.disabled = false;
  }
});
$('guardar').addEventListener('click', guardar);
$('descartar').addEventListener('click', descartar);
cerrarAlTocarFondo($('editor'));
cerrarAlTocarFondo($('dialogo-confirmar'));

window.addEventListener('beforeunload', (e) => {
  if (sucio()) { e.preventDefault(); e.returnValue = ''; }
});

arrancar();
