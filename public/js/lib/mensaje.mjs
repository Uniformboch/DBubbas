// Mensaje de WhatsApp con el formato acordado. Sin DOM.
import { detalleLinea } from './carrito.mjs';
import { ENTREGAS } from './validacion.mjs';

export function textoLinea(d) {
  const partes = d.partes.length ? ` (${d.partes.join(', ')})` : '';
  const extras = d.extras.length ? ` + ${d.extras.join(', ')}` : '';
  return `• ${d.cantidad} × ${d.nombre}${partes}${extras} — $${d.total}`;
}

/** Arma el texto del pedido. `lineas` ya debe venir limpia. */
export function construirMensaje(menu, temporada, lineas, cliente) {
  const detalles = lineas.map((l) => detalleLinea(menu, temporada, l)).filter(Boolean);
  const total = detalles.reduce((s, d) => s + d.total, 0);
  const una = (s) => (s || '').trim().replace(/\s*\n+\s*/g, ' · ');

  const renglones = [
    `Hola, ${menu.config.negocio}. Quiero hacer un pedido:`,
    '',
    ...detalles.map(textoLinea),
    '',
    `*Total: $${total}*`,
    '',
    `Nombre: ${una(cliente.nombre)}`,
    `Entrega: ${ENTREGAS[cliente.entrega]}`,
  ];
  if (cliente.entrega === 'domicilio') {
    renglones.push(`Dirección: ${una(cliente.direccion)}`, 'Envío: por confirmar');
  }
  if (una(cliente.notas)) renglones.push(`Notas: ${una(cliente.notas)}`);
  return renglones.join('\n');
}

export function enlaceWhatsApp(numero, texto) {
  return `https://wa.me/${String(numero).replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
}
