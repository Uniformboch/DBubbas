// Lectura del menú: sin DOM, para usarse en el navegador, el servidor y las pruebas.

/** Todas las categorías, con la de temporada al principio si está activa. */
export function categorias(menu, temporada) {
  const lista = [...(menu.categorias || [])];
  if (temporada && temporada.activa && temporada.categoria) lista.unshift(temporada.categoria);
  return lista;
}

/** Productos que se muestran (los `disponible: false` se ocultan). */
export function productosVisibles(categoria) {
  return (categoria.productos || []).filter((p) => p.disponible !== false);
}

/** Busca un producto por id y devuelve { categoria, producto } o null. */
export function buscarProducto(menu, temporada, productoId) {
  for (const categoria of categorias(menu, temporada)) {
    const producto = (categoria.productos || []).find((p) => p.id === productoId);
    if (producto) return { categoria, producto };
  }
  return null;
}

/** Claves de tamaño del producto, en el orden de `menu.tamanos`; ['unico'] si tiene precio único. */
export function tamanosDe(menu, producto) {
  const precios = producto.precios || {};
  if ('unico' in precios) return ['unico'];
  return Object.keys(menu.tamanos || {}).filter((t) => t in precios);
}

/** Extras que se ofrecen: la lista del producto si la tiene; si no, la de su categoría. */
export function extrasDe(menu, categoria, producto) {
  const ids = Array.isArray(producto.extrasPermitidos)
    ? producto.extrasPermitidos
    : categoria.extrasPermitidos || [];
  return ids.map((id) => (menu.extras || []).find((e) => e.id === id)).filter(Boolean);
}

/** Opciones obligatorias: las del producto si las tiene; si no, las de su categoría. */
export function opcionesDe(categoria, producto) {
  if (Array.isArray(producto.opciones)) return producto.opciones;
  return categoria.opciones || [];
}

/** Nombre con el prefijo de la categoría, ej. "Frapeado Taro". */
export function nombrePedido(categoria, producto) {
  return categoria.prefijoPedido ? `${categoria.prefijoPedido} ${producto.nombre}` : producto.nombre;
}

/**
 * Precio unitario de una elección. Devuelve null si la elección no es válida
 * (tamaño, opción o extra que no existe).
 * eleccion = { tamano, opciones: { grupoId: valorId }, extras: [extraId] }
 */
export function precioUnitario(menu, categoria, producto, eleccion) {
  const base = (producto.precios || {})[eleccion.tamano];
  if (!Number.isInteger(base)) return null;
  let total = base;
  for (const grupo of opcionesDe(categoria, producto)) {
    const valorId = (eleccion.opciones || {})[grupo.id];
    const valor = grupo.valores.find((x) => x.id === valorId);
    if (!valor) return null;
    total += valor.precio || 0;
  }
  const permitidos = extrasDe(menu, categoria, producto);
  for (const extraId of eleccion.extras || []) {
    const extra = permitidos.find((e) => e.id === extraId);
    if (!extra) return null;
    total += extra.precio;
  }
  return total;
}
