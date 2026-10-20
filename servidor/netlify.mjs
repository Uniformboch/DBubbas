// Conexión con Netlify: almacenes en Blobs y contenido inicial del repositorio.
import { getStore } from '@netlify/blobs';
import { crearServidor } from './api.mjs';
import menu from '../data/menu.json' with { type: 'json' };
import temporada from '../data/menu-temporada.json' with { type: 'json' };

let servidor;

/** Se crea una vez por instancia de la función. */
export function servidorNetlify() {
  if (!servidor) {
    const almacen = (nombre) => getStore({ name: nombre, consistency: 'strong' });
    servidor = crearServidor({
      almacenes: {
        estado: almacen('menu-estado'),
        fotos: almacen('menu-fotos'),
        respaldos: almacen('menu-respaldos'),
        intentos: almacen('menu-intentos'),
      },
      entorno: {
        ADMIN_PASSWORD_HASH: Netlify.env.get('ADMIN_PASSWORD_HASH'),
        SESSION_SECRET: Netlify.env.get('SESSION_SECRET'),
      },
      inicial: { menu, temporada },
    });
  }
  return servidor;
}