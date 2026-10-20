// Genera los dos valores secretos para Netlify a partir de la contraseña del dueño.
// La contraseña se escribe sin que se vea y NUNCA se guarda en ningún archivo.
// Uso: node scripts/generar-secretos.mjs
import { randomBytes } from 'node:crypto';
import { cifrarContrasena } from '../servidor/seguridad.mjs';

function preguntarOculto(pregunta) {
  return new Promise((resolver, rechazar) => {
    const entrada = process.stdin;
    if (!entrada.isTTY) return rechazar(new Error('Corre este script en una terminal.'));
    process.stdout.write(pregunta);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    let texto = '';
    const alTeclear = (tecla) => {
      for (const c of tecla) {
        if (c === '\r' || c === '\n') {
          entrada.setRawMode(false); entrada.pause(); entrada.off('data', alTeclear);
          process.stdout.write('\n');
          return resolver(texto);
        }
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(1); } // Ctrl+C
        if (c === '\u007f' || c === '\b') { texto = texto.slice(0, -1); continue; }
        texto += c;
      }
    };
    entrada.on('data', alTeclear);
  });
}

const contrasena = await preguntarOculto('Contraseña nueva del panel (no se verá al escribir): ');
if (contrasena.length < 10) {
  console.log('Usa al menos 10 caracteres. Vuelve a correr el script.');
  process.exit(1);
}
const repetida = await preguntarOculto('Escríbela otra vez: ');
if (repetida !== contrasena) {
  console.log('No coinciden. Vuelve a correr el script.');
  process.exit(1);
}

console.log('\nCalculando (tarda unos segundos)…\n');
const hash = await cifrarContrasena(contrasena);
const secreto = randomBytes(32).toString('base64url');

console.log('Copia cada VALOR en Netlify, en la variable con ese NOMBRE (Key):\n');
console.log('  Nombre (Key):  ADMIN_PASSWORD_HASH');
console.log(`  Valor:         ${hash}\n`);
console.log('  Nombre (Key):  SESSION_SECRET');
console.log(`  Valor:         ${secreto}\n`);
console.log('No compartas estos valores por chat. Al terminar, cierra esta ventana.');
