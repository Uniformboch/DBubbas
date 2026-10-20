// Validación del lado del cliente (hoja de producto y formulario del pedido). Sin DOM.
import { opcionesDe, tamanosDe } from './catalogo.mjs';
import { CANTIDAD_MAXIMA } from './carrito.mjs';

export const LIMITES = { nombre: 60, direccion: 200, notas: 300 };
export const ENTREGAS = { recoger: 'Recoger en sucursal', domicilio: 'A domicilio' };

/**
 * Revisa la elección de la hoja de producto.
 * Devuelve { campo: mensaje }; vacío si está completa. Los campos son 'tamano',
 * el id de cada grupo de opciones y 'cantidad'.
 */
export function validarEleccion(menu, categoria, producto, eleccion) {
  const errores = {};
  const tamanos = tamanosDe(menu, producto);
  if (!tamanos.includes(eleccion.tamano)) errores.tamano = 'Elige tamaño para continuar.';
  for (const grupo of opcionesDe(categoria, producto)) {
    const valor = (eleccion.opciones || {})[grupo.id];
    if (!grupo.valores.some((v) => v.id === valor)) {
      errores[grupo.id] = `Elige ${grupo.nombre.toLowerCase()} para continuar.`;
    }
  }
  const c = eleccion.cantidad;
  if (!Number.isInteger(c) || c < 1 || c > CANTIDAD_MAXIMA) {
    errores.cantidad = `La cantidad debe ser de 1 a ${CANTIDAD_MAXIMA}.`;
  }
  return errores;
}

/** Revisa el formulario del pedido. Devuelve { campo: mensaje } en el orden de los campos. */
export function validarCliente(cliente, lineas = []) {
  const errores = {};
  const nombre = (cliente.nombre || '').trim();
  const direccion = (cliente.direccion || '').trim();
  const notas = (cliente.notas || '').trim();

  if (!lineas.length) errores.carrito = 'Agrega al menos un producto.';
  if (!nombre) errores.nombre = 'Escribe tu nombre.';
  else if (nombre.length > LIMITES.nombre) errores.nombre = `Máximo ${LIMITES.nombre} caracteres.`;
  if (!(cliente.entrega in ENTREGAS)) errores.entrega = 'Elige cómo quieres recibir tu pedido.';
  if (cliente.entrega === 'domicilio') {
    if (!direccion) errores.direccion = 'Escribe la dirección de entrega.';
    else if (direccion.length > LIMITES.direccion) errores.direccion = `Máximo ${LIMITES.direccion} caracteres.`;
  }
  if (notas.length > LIMITES.notas) errores.notas = `Máximo ${LIMITES.notas} caracteres.`;
  return errores;
}
