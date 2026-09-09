import assert from "node:assert/strict";
import test from "node:test";
import {
  SURVIVAL_RUNTIME_LEASE_KEY,
  SURVIVAL_RUNTIME_LEASE_MILLISECONDS,
  claimSurvivalRuntimeLease,
  ownsSurvivalRuntimeLease,
  readSurvivalRuntimeLease,
  releaseSurvivalRuntimeLease,
  loadStoredRun,
} from "../app/survival/use-survival-runtime.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("inaccessible legacy storage cannot be mistaken for an absent study", () => {
  const denied = { getItem() { throw new DOMException("Blocked", "SecurityError"); }, setItem() { assert.fail("No write is allowed after a failed read"); } };
  assert.throws(() => loadStoredRun(denied), /could not be read/);
  const storage = memoryStorage();
  assert.deepEqual(loadStoredRun(storage), { world: null, recoveryNotice: null });
  storage.setItem("simulation:survival-run:v1", "invalid checkpoint");
  const invalid = loadStoredRun(storage);
  assert.equal(invalid.world, null);
  assert.match(invalid.recoveryNotice, /invalid/);
  assert.equal(storage.getItem("simulation:survival-run:v1"), "invalid checkpoint");
  assert.equal(storage.getItem("simulation:survival-run:unreadable-backup"), "invalid checkpoint");
});

test("survival runtime lease admits one leader and supports deliberate takeover", () => {
  const storage = memoryStorage();

  assert.equal(claimSurvivalRuntimeLease(storage, "tab-a", 100), true);
  assert.equal(claimSurvivalRuntimeLease(storage, "tab-b", 200), false);
  assert.equal(ownsSurvivalRuntimeLease(storage, "tab-a", 200), true);
  assert.equal(ownsSurvivalRuntimeLease(storage, "tab-b", 200), false);

  assert.equal(claimSurvivalRuntimeLease(storage, "tab-b", 300, true), true);
  assert.equal(ownsSurvivalRuntimeLease(storage, "tab-a", 300), false);
  assert.equal(ownsSurvivalRuntimeLease(storage, "tab-b", 300), true);
  assert.equal(releaseSurvivalRuntimeLease(storage, "tab-a"), false);
  assert.equal(releaseSurvivalRuntimeLease(storage, "tab-b"), true);
  assert.equal(readSurvivalRuntimeLease(storage), null);
});

test("survival runtime lease renews and can be recovered after expiry", () => {
  const storage = memoryStorage();
  assert.equal(claimSurvivalRuntimeLease(storage, "tab-a", 1_000), true);
  assert.equal(readSurvivalRuntimeLease(storage)?.expiresAt, 1_000 + SURVIVAL_RUNTIME_LEASE_MILLISECONDS);

  assert.equal(claimSurvivalRuntimeLease(storage, "tab-a", 3_000), true);
  assert.equal(readSurvivalRuntimeLease(storage)?.expiresAt, 3_000 + SURVIVAL_RUNTIME_LEASE_MILLISECONDS);
  assert.equal(claimSurvivalRuntimeLease(storage, "tab-b", 5_999), false);
  assert.equal(claimSurvivalRuntimeLease(storage, "tab-b", 6_000), true);
  assert.equal(ownsSurvivalRuntimeLease(storage, "tab-b", 6_001), true);
});

test("malformed lease data is treated as expired and replaced safely", () => {
  const storage = memoryStorage();
  storage.setItem(SURVIVAL_RUNTIME_LEASE_KEY, "not-json");
  assert.equal(readSurvivalRuntimeLease(storage), null);
  assert.equal(claimSurvivalRuntimeLease(storage, "tab-a", 50), true);
  assert.deepEqual(readSurvivalRuntimeLease(storage), {
    ownerId: "tab-a",
    expiresAt: 50 + SURVIVAL_RUNTIME_LEASE_MILLISECONDS,
  });
});
