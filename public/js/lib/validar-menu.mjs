// Validación completa del menú y la temporada antes de guardar.
// La usan el servidor (obligatoria) y el panel (para avisar antes de enviar). Sin DOM.

export const LIMITES_MENU = {
  precioMin: 1, precioMax: 9999,
  valoresMin: 2, valoresMax: 15,
  nombre: 80, descripcion: 300, detalle: 40, prefijo: 30,
  categorias: 30, productos: 200, extras: 60, grupos: 6,
};
const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
const FOTO = /^\/fotos\/[a-z0-9][a-z0-9-]{0,80}\.(jpg|png|webp)$/;
const GRUPOS = ['bebidas', 'comida'];

const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * Devuelve una lista de errores en español (vacía si todo está bien).
 * `fotoExiste(url)` dice si una foto ya está subida; si no se pasa, solo se revisa el formato.
 */
export function validarEstado(estado, { fotoExiste } = {}) {
  const errores = [];
  const error = (donde, texto) => errores.push(`${donde}: ${texto}`);

  const camposConocidos = (obj, permitidos, donde) => {
    for (const k of Object.keys(obj)) if (!permitidos.includes(k)) error(donde, `campo desconocido "${k}"`);
  };
  const texto = (v, donde, campo, max, obligatorio) => {
    if (v === undefined && !obligatorio) return;
    if (typeof v !== 'string' || (obligatorio && !v.trim())) return error(donde, `${campo} es obligatorio`);
    if (v.length > max) error(donde, `${campo} tiene más de ${max} caracteres`);
  };
  const precio = (v, donde) => {
    if (!Number.isInteger(v) || v < LIMITES_MENU.precioMin || v > LIMITES_MENU.precioMax) {
      error(donde, `el precio debe ser un número entero de ${LIMITES_MENU.precioMin} a ${LIMITES_MENU.precioMax}`);
    }
  };
  const id = (v, donde) => {
    if (typeof v !== 'string' || !ID.test(v)) error(donde, 'identificador inválido');
  };
  const booleano = (v, donde, campo) => {
    if (v !== undefined && typeof v !== 'boolean') error(donde, `${campo} debe ser sí o no`);
  };
  const foto = (v, donde) => {
    if (v === undefined) return;
    if (typeof v !== 'string' || !FOTO.test(v)) return error(donde, 'la foto no es válida');
    if (fotoExiste && !fotoExiste(v)) error(donde, 'la foto no existe (vuelve a subirla)');
  };

  if (!esObjeto(estado)) return ['El contenido no es un menú.'];
  camposConocidos(estado, ['menu', 'temporada'], 'Contenido');
  const { menu, temporada } = estado;
  if (!esObjeto(menu)) return [...errores, 'Falta el menú.'];
  if (!esObjeto(temporada)) return [...errores, 'Falta la temporada.'];

  camposConocidos(menu, ['config', 'tamanos', 'extras', 'categorias'], 'Menú');

  // Configuración
  if (!esObjeto(menu.config)) error('Ajustes', 'faltan');
  else {
    camposConocidos(menu.config, ['negocio', 'whatsapp'], 'Ajustes');
    texto(menu.config.negocio, 'Ajustes', 'el nombre del negocio', LIMITES_MENU.nombre, true);
    if (typeof menu.config.whatsapp !== 'string' || !/^\d{10,15}$/.test(menu.config.whatsapp)) {
      error('Ajustes', 'el número de WhatsApp debe tener de 10 a 15 dígitos');
    }
  }

  // Tamaños
  const tamanos = esObjeto(menu.tamanos) ? menu.tamanos : {};
  if (!esObjeto(menu.tamanos) || !Object.keys(tamanos).length) error('Tamaños', 'faltan');
  for (const [k, t] of Object.entries(tamanos)) {
    if (!ID.test(k) || k === 'unico') error('Tamaños', `clave inválida "${k}"`);
    if (!esObjeto(t)) { error('Tamaños', `"${k}" no es válido`); continue; }
    camposConocidos(t, ['nombre'], `Tamaño ${k}`);
    texto(t.nombre, `Tamaño ${k}`, 'el nombre', LIMITES_MENU.nombre, true);
  }

  // Extras
  const idsExtras = new Set();
  if (!Array.isArray(menu.extras)) error('Extras', 'faltan');
  else {
    if (menu.extras.length > LIMITES_MENU.extras) error('Extras', `máximo ${LIMITES_MENU.extras}`);
    menu.extras.forEach((x, i) => {
      const donde = `Extra ${esObjeto(x) && typeof x.nombre === 'string' && x.nombre ? `"${x.nombre}"` : i + 1}`;
      if (!esObjeto(x)) return error(donde, 'no es válido');
      camposConocidos(x, ['id', 'nombre', 'precio'], donde);
      id(x.id, donde);
      if (idsExtras.has(x.id)) error(donde, 'identificador repetido');
      idsExtras.add(x.id);
      texto(x.nombre, donde, 'el nombre', LIMITES_MENU.nombre, true);
      precio(x.precio, donde);
    });
  }
  const listaExtras = (lista, donde) => {
    if (lista === undefined) return;
    if (!Array.isArray(lista)) return error(donde, 'la lista de extras no es válida');
    if (new Set(lista).size !== lista.length) error(donde, 'hay extras repetidos');
    for (const x of lista) if (!idsExtras.has(x)) error(donde, `el extra "${x}" no existe`);
  };

  const opciones = (lista, donde) => {
    if (lista === undefined) return;
    if (!Array.isArray(lista)) return error(donde, 'las opciones no son válidas');
    if (lista.length > LIMITES_MENU.grupos) error(donde, `máximo ${LIMITES_MENU.grupos} grupos de opciones`);
    const idsGrupo = new Set();
    lista.forEach((g, i) => {
      const dg = `${donde}, opción ${esObjeto(g) && typeof g.nombre === 'string' && g.nombre ? `"${g.nombre}"` : i + 1}`;
      if (!esObjeto(g)) return error(dg, 'no es válida');
      camposConocidos(g, ['id', 'nombre', 'valores'], dg);
      id(g.id, dg);
      if (idsGrupo.has(g.id)) error(dg, 'identificador repetido');
      idsGrupo.add(g.id);
      texto(g.nombre, dg, 'el nombre', LIMITES_MENU.nombre, true);
      if (!Array.isArray(g.valores) || g.valores.length < LIMITES_MENU.valoresMin || g.valores.length > LIMITES_MENU.valoresMax) {
        return error(dg, `debe tener de ${LIMITES_MENU.valoresMin} a ${LIMITES_MENU.valoresMax} valores`);
      }
      const idsValor = new Set();
      g.valores.forEach((v, j) => {
        const dv = `${dg}, valor ${j + 1}`;
        if (!esObjeto(v)) return error(dv, 'no es válido');
        camposConocidos(v, ['id', 'nombre', 'precio'], dv);
        id(v.id, dv);
        if (idsValor.has(v.id)) error(dv, 'identificador repetido');
        idsValor.add(v.id);
        texto(v.nombre, dv, 'el nombre', LIMITES_MENU.nombre, true);
        if (v.precio !== undefined) precio(v.precio, dv);
      });
    });
  };

  const idsProducto = new Set();
  const producto = (p, donde, { soloUnico }) => {
    if (!esObjeto(p)) return error(donde, 'no es válido');
    const dp = `${donde} "${typeof p.nombre === 'string' && p.nombre ? p.nombre : '(sin nombre)'}"`;
    camposConocidos(p, ['id', 'nombre', 'detalle', 'descripcion', 'precios', 'extrasPermitidos', 'opciones', 'agotado', 'disponible', 'imagen'], dp);
    id(p.id, dp);
    if (idsProducto.has(p.id)) error(dp, 'identificador repetido');
    idsProducto.add(p.id);
    texto(p.nombre, dp, 'el nombre', LIMITES_MENU.nombre, true);
    texto(p.detalle, dp, 'el detalle', LIMITES_MENU.detalle, false);
    texto(p.descripcion, dp, 'la descripción', LIMITES_MENU.descripcion, false);
    booleano(p.agotado, dp, 'agotado');
    booleano(p.disponible, dp, 'disponible');
    foto(p.imagen, dp);
    listaExtras(p.extrasPermitidos, dp);
    opciones(p.opciones, dp);
    if (!esObjeto(p.precios) || !Object.keys(p.precios).length) return error(dp, 'falta el precio');
    const claves = Object.keys(p.precios);
    if (claves.includes('unico') && claves.length > 1) error(dp, 'no puede tener precio único y por tamaño a la vez');
    if (soloUnico && (claves.length !== 1 || claves[0] !== 'unico')) error(dp, 'en temporada el precio es único');
    for (const k of claves) {
      if (k !== 'unico' && !(k in tamanos)) error(dp, `el tamaño "${k}" no existe`);
      precio(p.precios[k], dp);
    }
  };

  const idsCategoria = new Set();
  const categoria = (c, donde, { soloUnico = false } = {}) => {
    if (!esObjeto(c)) return error(donde, 'no es válida');
    const dc = `${donde} "${typeof c.nombre === 'string' && c.nombre ? c.nombre : '(sin nombre)'}"`;
    camposConocidos(c, ['id', 'nombre', 'grupo', 'descripcion', 'prefijoPedido', 'extrasPermitidos', 'opciones', 'productos'], dc);
    id(c.id, dc);
    if (idsCategoria.has(c.id)) error(dc, 'identificador repetido');
    idsCategoria.add(c.id);
    texto(c.nombre, dc, 'el nombre', LIMITES_MENU.nombre, true);
    texto(c.descripcion, dc, 'la descripción', LIMITES_MENU.descripcion, false);
    texto(c.prefijoPedido, dc, 'el prefijo', LIMITES_MENU.prefijo, false);
    if (!GRUPOS.includes(c.grupo)) error(dc, 'el grupo debe ser bebidas o comida');
    listaExtras(c.extrasPermitidos, dc);
    opciones(c.opciones, dc);
    if (!Array.isArray(c.productos)) return error(dc, 'faltan los productos');
    if (c.productos.length > LIMITES_MENU.productos) error(dc, `máximo ${LIMITES_MENU.productos} productos`);
    c.productos.forEach((p, i) => producto(p, `Producto ${i + 1} de ${c.nombre}`, { soloUnico }));
  };

  if (!Array.isArray(menu.categorias) || !menu.categorias.length) error('Secciones', 'faltan');
  else {
    if (menu.categorias.length > LIMITES_MENU.categorias) error('Secciones', `máximo ${LIMITES_MENU.categorias}`);
    menu.categorias.forEach((c, i) => categoria(c, `Sección ${i + 1}`));
  }

  // Temporada
  camposConocidos(temporada, ['activa', 'categoria'], 'Temporada');
  if (typeof temporada.activa !== 'boolean') error('Temporada', 'falta indicar si se muestra');
  if (!esObjeto(temporada.categoria)) error('Temporada', 'falta la sección');
  else categoria(temporada.categoria, 'Temporada', { soloUnico: true });

  return errores;
}

/** Todas las fotos que usa el menú (para revisar que existan). */
export function fotosUsadas(estado) {
  const cats = [...(estado.menu?.categorias || []), estado.temporada?.categoria].filter(Boolean);
  return cats.flatMap((c) => (c.productos || []).map((p) => p.imagen).filter(Boolean));
}
