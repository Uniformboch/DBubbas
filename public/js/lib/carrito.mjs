// Carrito: lista de líneas (producto + tamaño + opciones + extras + cantidad). Sin DOM.
import { buscarProducto, opcionesDe, nombrePedido, precioUnitario } from './catalogo.mjs';

export const CANTIDAD_MAXIMA = 20;

/** Copia normalizada de una elección: extras ordenados y sin repetir, opciones en orden de grupo. */
function normalizar(linea) {
  const opciones = {};
  for (const k of Object.keys(linea.opciones || {}).sort()) opciones[k] = linea.opciones[k];
  return {
    productoId: linea.productoId,
    tamano: linea.tamano,
    opciones,
    extras: [...new Set(linea.extras || [])].sort(),
    cantidad: linea.cantidad,
  };
}

/** Identifica una combinación; dos líneas con la misma clave se suman. */
export function claveLinea(linea) {
  const n = normalizar(linea);
  const ops = Object.entries(n.opciones).map(([g, v]) => `${g}=${v}`).join(',');
  return `${n.productoId}|${n.tamano}|${ops}|${n.extras.join(',')}`;
}

const tope = (n) => Math.min(CANTIDAD_MAXIMA, Math.max(0, n));

/** Agrega una línea (devuelve una lista nueva). Si ya existe la combinación, suma la cantidad. */
export function agregar(lineas, linea) {
  const nueva = normalizar(linea);
  const clave = claveLinea(nueva);
  const i = lineas.findIndex((l) => claveLinea(l) === clave);
  if (i === -1) return [...lineas, { ...nueva, cantidad: tope(nueva.cantidad) || 1 }];
  return lineas.map((l, j) => (j === i ? { ...l, cantidad: tope(l.cantidad + nueva.cantidad) } : l));
}

/** Suma `delta` a la línea `i`; si queda en 0 se quita. */
export function cambiarCantidad(lineas, i, delta) {
  if (!lineas[i]) return lineas;
  const cantidad = tope(lineas[i].cantidad + delta);
  if (cantidad === 0) return lineas.filter((_, j) => j !== i);
  return lineas.map((l, j) => (j === i ? { ...l, cantidad } : l));
}

/** Detalle de una línea para mostrar y para el mensaje. Null si ya no es válida. */
export function detalleLinea(menu, temporada, linea) {
  const encontrado = buscarProducto(menu, temporada, linea.productoId);
  if (!encontrado) return null;
  const { categoria, producto } = encontrado;
  if (producto.agotado || producto.disponible === false) return null;
  const unitario = precioUnitario(menu, categoria, producto, linea);
  if (unitario == null) return null;

  const partes = [];
  if (linea.tamano !== 'unico') partes.push(menu.tamanos[linea.tamano]?.nombre || linea.tamano);
  const grupos = opcionesDe(categoria, producto);
  for (const grupo of grupos) {
    const nombre = grupo.valores.find((v) => v.id === linea.opciones[grupo.id]).nombre;
    // Si el mismo nombre existe en otro grupo (ej. Fresa en mermelada y en fruta), se aclara el grupo
    const repetido = grupos.some((g) => g !== grupo && g.valores.some((v) => v.nombre === nombre));
    partes.push(repetido ? `${grupo.nombre}: ${nombre}` : nombre);
  }
  // En el orden del menú, no en el que se guardaron
  const elegidos = new Set(linea.extras || []);
  const extras = menu.extras.filter((e) => elegidos.has(e.id)).map((e) => e.nombre);
  return {
    nombre: nombrePedido(categoria, producto),
    partes,
    extras,
    unitario,
    cantidad: linea.cantidad,
    total: unitario * linea.cantidad,
  };
}

/**
 * Descarta las líneas que ya no existen en el menú (producto retirado o agotado,
 * tamaño, opción o extra que ya no existe) o que tienen datos raros, y junta las repetidas.
 */
export function limpiar(menu, temporada, lineas) {
  if (!Array.isArray(lineas)) return [];
  let limpio = [];
  for (const l of lineas) {
    if (!l || typeof l !== 'object' || typeof l.productoId !== 'string' || typeof l.tamano !== 'string') continue;
    if (!Number.isInteger(l.cantidad) || l.cantidad < 1 || l.cantidad > CANTIDAD_MAXIMA) continue;
    if (l.opciones != null && (typeof l.opciones !== 'object' || Array.isArray(l.opciones))) continue;
    if (l.extras != null && !Array.isArray(l.extras)) continue;
    const linea = normalizar(l);
    if (!detalleLinea(menu, temporada, linea)) continue;
    // Opciones de más (un grupo que se quitó del producto) también invalidan la línea
    const { categoria, producto } = buscarProducto(menu, temporada, linea.productoId);
    const grupos = opcionesDe(categoria, producto).map((g) => g.id).sort();
    if (Object.keys(linea.opciones).join() !== grupos.join()) continue;
    limpio = agregar(limpio, linea);
  }
  return limpio;
}

/** Cantidad de piezas y total del carrito. */
export function resumen(menu, temporada, lineas) {
  let piezas = 0;
  let total = 0;
  for (const l of lineas) {
    const d = detalleLinea(menu, temporada, l);
    if (!d) continue;
    piezas += d.cantidad;
    total += d.total;
  }
  return { piezas, total };
}
