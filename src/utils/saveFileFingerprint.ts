/**
 * Content fingerprint for an uploaded .fm file.
 *
 * Hashing 250 MB in one ArrayBuffer would double mobile memory pressure before
 * decode, so the file is hashed in 4 MB chunks with a chained SHA-256 digest.
 * The chain is stable for identical bytes and changes when any chunk changes.
 */

const CHUNK_BYTES = 4 * 1024 * 1024;

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

async function sha256Concat(
  previous: Uint8Array,
  chunk: Uint8Array
): Promise<Uint8Array> {
  const input = new Uint8Array(previous.byteLength + chunk.byteLength);
  input.set(previous, 0);
  input.set(chunk, previous.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return new Uint8Array(digest);
}

export async function computeSaveFileFingerprint(
  file: Blob
): Promise<string | null> {
  if (!(file.size > 0) || !globalThis.crypto?.subtle) return null;
  if (typeof file.stream !== 'function') return null;

  const reader = file.stream().getReader();
  let digest: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let buffered = new Uint8Array(CHUNK_BYTES);
  let filled = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      let offset = 0;
      while (offset < value.byteLength) {
        const take = Math.min(CHUNK_BYTES - filled, value.byteLength - offset);
        buffered.set(value.subarray(offset, offset + take), filled);
        filled += take;
        offset += take;

        if (filled === CHUNK_BYTES) {
          digest = await sha256Concat(digest, buffered);
          filled = 0;
        }
      }
    }
    if (filled > 0) {
      digest = await sha256Concat(digest, buffered.subarray(0, filled));
    }
  } finally {
    buffered = new Uint8Array(0);
    reader.releaseLock();
  }

  return `r15:${file.size}:${toHex(digest)}`;
}
