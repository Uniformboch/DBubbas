// Almacén en disco para el servidor local: igual que el de memoria, pero sobrevive al reinicio.
// Guarda en .datos-locales/<almacén>/ (carpeta excluida de git y de la publicación).
import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AlmacenMemoria } from './almacen-memoria.mjs';

const aArchivo = (clave) => encodeURIComponent(clave);
const deArchivo = (nombre) => decodeURIComponent(nombre);

export function almacenDisco(carpeta) {
  mkdirSync(carpeta, { recursive: true });
  const almacen = new AlmacenMemoria({
    alGuardar: async (clave) => {
      const base = join(carpeta, aArchivo(clave));
      const e = almacen.entradas.get(clave);
      if (!e) {
        rmSync(`${base}.bin`, { force: true });
        rmSync(`${base}.meta.json`, { force: true });
        return;
      }
      writeFileSync(`${base}.bin`, e.bytes);
      writeFileSync(`${base}.meta.json`, JSON.stringify({ etag: e.etag, metadata: e.metadata }));
    },
  });
  for (const nombre of readdirSync(carpeta)) {
    if (!nombre.endsWith('.bin')) continue;
    const clave = deArchivo(nombre.slice(0, -4));
    const meta = join(carpeta, `${aArchivo(clave)}.meta.json`);
    if (!existsSync(meta)) continue;
    const { etag, metadata } = JSON.parse(readFileSync(meta, 'utf8'));
    almacen.entradas.set(clave, { bytes: new Uint8Array(readFileSync(join(carpeta, nombre))), etag, metadata });
  }
  return almacen;
}
