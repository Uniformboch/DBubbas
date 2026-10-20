// Identificadores internos: se generan una sola vez a partir del nombre y no cambian después.

export function slug(texto) {
  const s = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50).replace(/-$/, '');
  return s || 'item';
}

/** Primer id libre: "taro", "taro-2", "taro-3"… */
export function idUnico(base, usados) {
  const b = slug(base);
  if (!usados.has(b)) { usados.add(b); return b; }
  for (let i = 2; ; i++) {
    const c = `${b}-${i}`;
    if (!usados.has(c)) { usados.add(c); return c; }
  }
}

/**
 * Da id a lo nuevo (productos, extras, opciones y valores sin id) sin tocar los que ya tienen.
 * Los ids de producto son únicos en todo el menú; los de opciones y valores, dentro de su grupo.
 */
export function asignarIds(estado) {
  const cats = [...estado.menu.categorias, estado.temporada.categoria];
  const usadosProd = new Set(cats.flatMap((c) => c.productos.map((p) => p.id).filter(Boolean)));
  const usadosExtra = new Set(estado.menu.extras.map((x) => x.id).filter(Boolean));
  // Sin nombre todavía no se le da id (la validación pedirá el nombre)
  const listo = (x) => !x.id && typeof x.nombre === 'string' && x.nombre.trim();
  for (const x of estado.menu.extras) if (listo(x)) x.id = idUnico(x.nombre, usadosExtra);

  const opciones = (lista) => {
    if (!Array.isArray(lista)) return;
    const usadosGrupo = new Set(lista.map((g) => g.id).filter(Boolean));
    for (const g of lista) {
      if (listo(g)) g.id = idUnico(g.nombre, usadosGrupo);
      const usadosValor = new Set(g.valores.map((v) => v.id).filter(Boolean));
      for (const v of g.valores) if (listo(v)) v.id = idUnico(v.nombre, usadosValor);
    }
  };
  for (const c of cats) {
    opciones(c.opciones);
    for (const p of c.productos) {
      if (!p.id) p.id = idUnico(`${c.id}-${p.nombre}`, usadosProd);
      opciones(p.opciones);
    }
  }
  return estado;
}
