// Arma la carpeta pública dist/ solo con lo necesario para el sitio.
// Los JSON del menú NO van aquí: los sirve la función `datos` desde Netlify Blobs.
import { cpSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const origen = join(raiz, 'public');
const destino = join(raiz, 'dist');

// Solo estos tipos de archivo se publican
const PERMITIDOS = /\.(html|css|mjs|js|webmanifest|png|jpg|webp|svg|ico|woff2|txt)$/i;

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
cpSync(origen, destino, {
  recursive: true,
  filter: (ruta) => statSync(ruta).isDirectory() || PERMITIDOS.test(ruta),
});

// Lista de lo publicado, para revisar
const lista = [];
const recorrer = (dir) => {
  for (const n of readdirSync(dir)) {
    const r = join(dir, n);
    if (statSync(r).isDirectory()) recorrer(r);
    else lista.push(relative(destino, r).split(sep).join('/'));
  }
};
recorrer(destino);
console.log(`dist/ listo con ${lista.length} archivos:`);
for (const f of lista.sort()) console.log(`  ${f}`);
