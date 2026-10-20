// Atiende el menú público (/menu.json, /menu-temporada.json) y las fotos (/fotos/*).
import { servidorNetlify } from '../../servidor/netlify.mjs';

export default async (request) => servidorNetlify().datos(request);

export const config = { path: ['/menu.json', '/menu-temporada.json', '/fotos/*'] };