// Crea .env.local con una contraseña de PRUEBA para el panel en esta computadora.
// No es la contraseña real del dueño (esa se genera con generar-secretos.mjs y va solo a Netlify).
// Uso: node scripts/preparar-local.mjs
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cifrarContrasena } from '../servidor/seguridad.mjs';

const archivo = fileURLToPath(new URL('../.env.local', import.meta.url));
if (existsSync(archivo) && !process.argv.includes('--reemplazar')) {
  console.log('.env.local ya existe. Usa --reemplazar para crear otro.');
  process.exit(0);
}

const contrasena = `prueba-${randomBytes(6).toString('hex')}`;
const contenido = [
  '# Solo para pruebas locales. No se sube a git ni a Netlify.',
  `PRUEBA_CONTRASENA=${contrasena}`,
  `ADMIN_PASSWORD_HASH=${await cifrarContrasena(contrasena)}`,
  `SESSION_SECRET=${randomBytes(32).toString('base64url')}`,
  '',
].join('\n');
writeFileSync(archivo, contenido, { mode: 0o600 });
console.log('Listo: .env.local creado. La contraseña de prueba está en ese archivo (PRUEBA_CONTRASENA).');
