// Atiende /api/* (panel del dueño).
import { servidorNetlify } from '../../servidor/netlify.mjs';

export default async (request, context) => servidorNetlify().api(request, { ip: context.ip });

export const config = { path: '/api/*' };