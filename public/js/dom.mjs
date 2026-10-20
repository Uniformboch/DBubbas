// Ayudantes de pantalla compartidos.

/** Crea un elemento con atributos e hijos (texto o nodos). Nunca usa innerHTML. */
export function el(etiqueta, attrs = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') nodo.className = v;
    else if (k === 'dataset') Object.assign(nodo.dataset, v);
    else if (k === 'style') for (const [p, val] of Object.entries(v)) nodo.style.setProperty(p, val);
    else if (k.startsWith('on') && typeof v === 'function') nodo.addEventListener(k.slice(2), v);
    else if (v === true) nodo.setAttribute(k, '');
    else nodo.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h != null && h !== false) nodo.append(h);
  return nodo;
}

export const dinero = (n) => `$${n}`;

let temporizador;
/** Aviso breve abajo de la pantalla (también lo leen los lectores de pantalla). */
export function avisar(texto) {
  const aviso = document.getElementById('aviso');
  aviso.textContent = texto;
  aviso.classList.add('visible');
  clearTimeout(temporizador);
  temporizador = setTimeout(() => aviso.classList.remove('visible'), 2600);
}

const regresos = new WeakMap();

function regresarFoco(dialogo) {
  const anterior = regresos.get(dialogo);
  regresos.delete(dialogo);
  if (anterior && anterior.isConnected && !anterior.closest('[hidden]') && typeof anterior.focus === 'function') {
    anterior.focus();
  }
}

/** Abre un <dialog> modal y, al cerrarse, regresa el foco a donde estaba. */
export function abrirDialogo(dialogo, { foco, origen } = {}) {
  // origen: a dónde regresar; Safari no enfoca los botones al tocarlos
  regresos.set(dialogo, origen || document.activeElement);
  if (!dialogo.dataset.conRegreso) {
    dialogo.dataset.conRegreso = '1';
    // Cierre con Esc: lo maneja el navegador
    dialogo.addEventListener('close', () => regresarFoco(dialogo));
  }
  dialogo.showModal();
  if (foco) foco.focus();
}

/** Cierra el diálogo y regresa el foco de inmediato. */
export function cerrarDialogo(dialogo) {
  if (dialogo.open) dialogo.close();
  regresarFoco(dialogo);
}

/** Cierra el diálogo al tocar el fondo oscuro. */
export function cerrarAlTocarFondo(dialogo) {
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) cerrarDialogo(dialogo);
  });
}
