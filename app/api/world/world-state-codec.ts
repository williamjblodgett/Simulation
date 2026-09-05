const CODEC = "wildgrid-gzip-v1";

// D1 caps a TEXT/BLOB value at 2,000,000 bytes. Keep enough headroom for
// bindings and future envelope fields while allowing the in-memory world to be
// substantially larger than its stored representation.
export const MAX_STORED_WORLD_BYTES = 1_800_000;
export const MAX_RAW_WORLD_BYTES = 32_000_000;
const MAX_LEGACY_STORED_WORLD_BYTES = 2_000_000;
const COMPRESSION_THRESHOLD_BYTES = 900_000;

interface CompressedWorldEnvelope {
  codec: typeof CODEC;
  rawBytes: number;
  data: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function collectBounded(
  stream: ReadableStream<Uint8Array>,
  maximumBytes: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("Decoded world exceeded its size bound.");
        throw new Error("Decoded civilization state exceeded its size bound.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  // Copy into an ArrayBuffer-backed view. Newer TypeScript lib definitions
  // otherwise conservatively treat Uint8Array<ArrayBufferLike> as possibly
  // SharedArrayBuffer, which Blob does not accept.
  const source = new Blob([bytes.slice().buffer]).stream();
  return collectBounded(
    source.pipeThrough(new CompressionStream("gzip")),
    MAX_STORED_WORLD_BYTES,
  );
}

async function gunzip(bytes: Uint8Array, expectedBytes: number): Promise<Uint8Array> {
  const source = new Blob([bytes.slice().buffer]).stream();
  const decoded = await collectBounded(
    source.pipeThrough(new DecompressionStream("gzip")),
    MAX_RAW_WORLD_BYTES,
  );
  if (decoded.byteLength !== expectedBytes) {
    throw new Error("Compressed civilization state failed its length check.");
  }
  return decoded;
}

function isCompressedEnvelope(value: unknown): value is CompressedWorldEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Partial<CompressedWorldEnvelope>;
  return envelope.codec === CODEC &&
    Number.isSafeInteger(envelope.rawBytes) &&
    Number(envelope.rawBytes) > 0 &&
    Number(envelope.rawBytes) <= MAX_RAW_WORLD_BYTES &&
    typeof envelope.data === "string";
}

/** Serialize a world into a D1-safe representation without changing its JSON. */
export async function encodeWorldState(
  value: unknown,
  options: { compress?: boolean } = {},
): Promise<string> {
  const raw = JSON.stringify(value);
  if (!raw) throw new Error("Civilization state could not be serialized.");
  const rawBytes = encoder.encode(raw);
  if (rawBytes.byteLength > MAX_RAW_WORLD_BYTES) {
    throw new Error("Civilization state exceeded its in-memory size bound.");
  }

  if (options.compress === false) {
    if (rawBytes.byteLength > MAX_LEGACY_STORED_WORLD_BYTES) {
      throw new Error("Uncompressed civilization state exceeded D1's storage bound.");
    }
    return raw;
  }

  if (rawBytes.byteLength < COMPRESSION_THRESHOLD_BYTES) return raw;

  const compressed = await gzip(rawBytes);
  const envelope: CompressedWorldEnvelope = {
    codec: CODEC,
    rawBytes: rawBytes.byteLength,
    data: bytesToBase64(compressed),
  };
  const stored = JSON.stringify(envelope);
  if (byteLength(stored) > MAX_STORED_WORLD_BYTES) {
    throw new Error("Compressed civilization state exceeded its persistence bound.");
  }
  return stored;
}

/** Decode both legacy plain JSON rows and the scalable compressed envelope. */
export async function decodeWorldState(stored: string): Promise<unknown> {
  if (!stored || byteLength(stored) > MAX_LEGACY_STORED_WORLD_BYTES) {
    throw new Error("Persisted civilization state exceeded its storage bound.");
  }
  const parsed: unknown = JSON.parse(stored);
  if (!isCompressedEnvelope(parsed)) return parsed;
  if (byteLength(stored) > MAX_STORED_WORLD_BYTES) {
    throw new Error("Compressed civilization state exceeded its storage bound.");
  }

  const compressed = base64ToBytes(parsed.data);
  const raw = await gunzip(compressed, parsed.rawBytes);
  return JSON.parse(decoder.decode(raw)) as unknown;
}
