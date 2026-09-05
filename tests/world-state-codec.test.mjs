import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_STORED_WORLD_BYTES,
  decodeWorldState,
  encodeWorldState,
} from "../app/api/world/world-state-codec.ts";

function largeWorld() {
  return {
    version: 2,
    agents: Array.from({ length: 1_000 }, (_, index) => ({
      id: `agent-${index}`,
      name: `Autonomous Agent ${index}`,
      rationale: `${index}:` + "resources relationships learning lineage belief ".repeat(12),
      memories: Array.from({ length: 8 }, (__, memory) => ({
        id: `${index}-${memory}`,
        summary: "A repeated but individually persisted decision outcome.",
      })),
    })),
  };
}

test("world-state codec keeps legacy JSON rows readable", async () => {
  const legacy = { version: 2, day: 42, agents: [{ id: "agent-0001" }] };
  assert.deepEqual(await decodeWorldState(JSON.stringify(legacy)), legacy);
});

test("world-state codec compresses and restores a large civilization", async () => {
  const world = largeWorld();
  const raw = JSON.stringify(world);
  assert.ok(Buffer.byteLength(raw) > 900_000);

  const stored = await encodeWorldState(world);
  assert.ok(Buffer.byteLength(stored) < MAX_STORED_WORLD_BYTES);
  assert.match(stored, /wildgrid-gzip-v1/);
  assert.deepEqual(await decodeWorldState(stored), world);
});

test("world-state codec rejects a tampered compressed length", async () => {
  const world = largeWorld();
  const stored = await encodeWorldState(world);
  const envelope = JSON.parse(stored);
  envelope.rawBytes += 1;
  await assert.rejects(
    decodeWorldState(JSON.stringify(envelope)),
    /length check/,
  );
});
