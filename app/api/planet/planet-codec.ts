const CODEC = "wildgrid-planet-gzip-v1";

// D1 currently permits a little more than this per TEXT value. Keeping the
// application limit lower gives bindings and future envelope fields headroom.
export const MAX_PLANET_STORED_BYTES = 1_450_000;
export const MAX_PLANET_RAW_BYTES = 8_000_000;
export const TARGET_PLANET_SHARD_RAW_BYTES = 720_000;
export const MAX_PLANET_RESPONSE_BYTES = 600_000;
const COMPRESSION_THRESHOLD_BYTES = 48_000;

interface CompressedEnvelope {
  codec: typeof CODEC;
  rawBytes: number;
  data: string;
}

export interface EncodedPlanetPayload {
  stored: string;
  storedBytes: number;
  rawBytes: number;
  checksum: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function utf8ByteLength(value: string): number {
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
        await reader.cancel("Planet payload exceeded its decoded size bound.");
        throw new Error("Planet payload exceeded its decoded size bound.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function digest(bytes: Uint8Array): Promise<string> {
  const safeBuffer = bytes.slice().buffer;
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", safeBuffer));
  return Array.from(hash, (part) => part.toString(16).padStart(2, "0")).join("");
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return collectBounded(
    new Blob([bytes.slice().buffer])
      .stream()
      .pipeThrough(new CompressionStream("gzip")),
    MAX_PLANET_STORED_BYTES,
  );
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return collectBounded(
    new Blob([bytes.slice().buffer])
      .stream()
      .pipeThrough(new DecompressionStream("gzip")),
    MAX_PLANET_RAW_BYTES,
  );
}

function isCompressedEnvelope(value: unknown): value is CompressedEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<CompressedEnvelope>;
  return candidate.codec === CODEC &&
    Number.isSafeInteger(candidate.rawBytes) &&
    Number(candidate.rawBytes) > 0 &&
    Number(candidate.rawBytes) <= MAX_PLANET_RAW_BYTES &&
    typeof candidate.data === "string";
}

/** Encode one independently verifiable, D1-safe planet shard. */
export async function encodePlanetPayload(
  value: unknown,
): Promise<EncodedPlanetPayload> {
  const raw = JSON.stringify(value);
  if (typeof raw !== "string") {
    throw new Error("Planet payload could not be serialized.");
  }
  const rawData = encoder.encode(raw);
  if (rawData.byteLength === 0 || rawData.byteLength > MAX_PLANET_RAW_BYTES) {
    throw new Error("Planet payload exceeded its raw size bound.");
  }

  const checksum = await digest(rawData);
  let stored = raw;
  if (rawData.byteLength >= COMPRESSION_THRESHOLD_BYTES) {
    const envelope: CompressedEnvelope = {
      codec: CODEC,
      rawBytes: rawData.byteLength,
      data: bytesToBase64(await gzip(rawData)),
    };
    stored = JSON.stringify(envelope);
  }

  const storedBytes = utf8ByteLength(stored);
  if (storedBytes > MAX_PLANET_STORED_BYTES) {
    throw new Error("Planet payload exceeded its D1 shard size bound.");
  }
  return {
    stored,
    storedBytes,
    rawBytes: rawData.byteLength,
    checksum,
  };
}

/** Decode a plain or compressed shard and verify its uncompressed contents. */
export async function decodePlanetPayload(
  stored: string,
  expectedChecksum?: string,
): Promise<unknown> {
  if (!stored || utf8ByteLength(stored) > MAX_PLANET_STORED_BYTES) {
    throw new Error("Persisted planet shard exceeded its storage bound.");
  }
  const parsed: unknown = JSON.parse(stored);
  let rawData: Uint8Array;
  if (isCompressedEnvelope(parsed)) {
    rawData = await gunzip(base64ToBytes(parsed.data));
    if (rawData.byteLength !== parsed.rawBytes) {
      throw new Error("Compressed planet shard failed its length check.");
    }
  } else {
    rawData = encoder.encode(stored);
  }
  if (expectedChecksum && (await digest(rawData)) !== expectedChecksum) {
    throw new Error("Persisted planet shard failed its checksum.");
  }
  return JSON.parse(decoder.decode(rawData)) as unknown;
}

/**
 * Pack JSON-safe items without splitting an item. This raw-size target keeps
 * even poorly compressible shards comfortably below the hard D1 limit.
 */
export function packPlanetItems<T>(
  items: readonly T[],
  targetBytes = TARGET_PLANET_SHARD_RAW_BYTES,
): T[][] {
  if (!Number.isSafeInteger(targetBytes) || targetBytes < 1_024) {
    throw new Error("Planet shard target must be at least 1 KiB.");
  }
  const result: T[][] = [];
  let current: T[] = [];
  let currentBytes = 2;

  for (const item of items) {
    const itemBytes = utf8ByteLength(JSON.stringify(item));
    if (itemBytes + 2 > MAX_PLANET_RAW_BYTES) {
      throw new Error("One planet record exceeded the per-shard raw size bound.");
    }
    const additionalBytes = itemBytes + (current.length > 0 ? 1 : 0);
    if (current.length > 0 && currentBytes + additionalBytes > targetBytes) {
      result.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(item);
    currentBytes += itemBytes + (current.length > 1 ? 1 : 0);
  }
  if (current.length > 0) result.push(current);
  return result;
}
