// Almacén que imita a Netlify Blobs (etags y escrituras condicionales) para pruebas y uso local.
// Solo implementa lo que usa el servidor: getWithMetadata, setJSON, set, list, delete.

let contador = 0;
const nuevoEtag = () => `"${Date.now().toString(36)}-${(++contador).toString(36)}"`;

function aBytes(datos) {
  if (datos instanceof Uint8Array) return new Uint8Array(datos);
  if (datos instanceof ArrayBuffer) return new Uint8Array(datos.slice(0));
  if (typeof datos === 'string') return new TextEncoder().encode(datos);
  throw new TypeError('Tipo de dato no soportado');
}

export class AlmacenMemoria {
  constructor({ alGuardar } = {}) {
    this.entradas = new Map();
    this.alGuardar = alGuardar; // para el almacén en disco
  }

  async getWithMetadata(clave, { type } = {}) {
    const e = this.entradas.get(clave);
    if (!e) return null;
    let data;
    if (type === 'json') data = JSON.parse(new TextDecoder().decode(e.bytes));
    else if (type === 'arrayBuffer') data = e.bytes.slice().buffer;
    else data = new TextDecoder().decode(e.bytes);
    return { data, etag: e.etag, metadata: { ...e.metadata } };
  }

  async get(clave, opciones) {
    const r = await this.getWithMetadata(clave, opciones);
    return r ? r.data : null;
  }

  async set(clave, datos, { metadata = {}, onlyIfMatch, onlyIfNew } = {}) {
    const actual = this.entradas.get(clave);
    if (onlyIfNew && actual) return { modified: false };
    if (onlyIfMatch !== undefined && (!actual || actual.etag !== onlyIfMatch)) return { modified: false };
    const etag = nuevoEtag();
    this.entradas.set(clave, { bytes: aBytes(datos), etag, metadata: { ...metadata } });
    await this.alGuardar?.(clave);
    return { modified: true, etag };
  }

  async setJSON(clave, datos, opciones) {
    return this.set(clave, JSON.stringify(datos), opciones);
  }

  async list({ prefix = '' } = {}) {
    const blobs = [...this.entradas.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, e]) => ({ key, etag: e.etag }))
      .sort((a, b) => (a.key < b.key ? -1 : 1));
    return { blobs, directories: [] };
  }

  async delete(clave) {
    this.entradas.delete(clave);
    await this.alGuardar?.(clave);
  }
}
