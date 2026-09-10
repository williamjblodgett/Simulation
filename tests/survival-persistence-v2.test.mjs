import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { IDBObjectStore } from "fake-indexeddb";
import { createSurvivalRun, advanceSurvivalRun, setSurvivalRunPaused } from "../app/simulation/survival/index.ts";
import { commitCheckpoint, loadCheckpoint, loadCommandCheckpoint, extendHistoryWindow, loadEventPage, loadSavedRuns, exportRunArchive, recoverLastGoodCheckpoint, validateCheckpoint } from "../app/survival/survival-persistence.ts";

const envelope = (world = createSurvivalRun("store-test", { agentCount: 1 }), revision = 1, runInstanceId = "run-a") => ({ runInstanceId, revision, world, speed: 1, savedAt: Date.now(), missingBefore: 0 });
async function rawDB() { return new Promise((resolve,reject) => { const request = indexedDB.open("simulation-survival-evidence-v2", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function writeRaw(db, key, value) { return new Promise((resolve,reject) => { const tx = db.transaction("checkpoints", "readwrite"); tx.objectStore("checkpoints").put(value,key); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }); }
async function clearDB() { const db = await rawDB(); await new Promise((resolve,reject) => { const tx = db.transaction(["checkpoints","events"],"readwrite"); tx.objectStore("checkpoints").clear(); tx.objectStore("events").clear(); tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error); }); db.close(); }

test("synchronous IndexedDB-open failure can be retried", async () => {
  const open = indexedDB.open; let calls=0;
  indexedDB.open = function(...args) { calls++; if(calls===1) throw new DOMException("Unavailable", "SecurityError"); return open.apply(this,args); };
  try { await assert.rejects(loadCheckpoint()); assert.equal(await loadCheckpoint(),null); assert.equal(calls,2); }
  finally { indexedDB.open=open; }
});

test("atomic checkpoint, history pagination, competing revisions and same-seed run isolation", async () => {
  await clearDB(); const initial=envelope();
  assert.equal(await commitCheckpoint(initial,initial.world.events,null),true);
  assert.deepEqual(await loadCheckpoint(),initial);
  const result=advanceSurvivalRun(initial.world,8), next=envelope(result.state,2);
  const competing=await Promise.all([commitCheckpoint(next,result.events,1),commitCheckpoint({...next,speed:2},result.events,1)]);
  assert.equal(competing.filter(Boolean).length,1);
  assert.equal(await commitCheckpoint({...next,revision:3},[],1),false);
  const page1=await loadEventPage("run-a",Number.MAX_SAFE_INTEGER,5),page2=await loadEventPage("run-a",Number(page1.at(-1).id.slice(6)),5);
  assert.equal(new Set([...page1,...page2].map(e=>e.id)).size,page1.length+page2.length);
  const another=envelope(initial.world,3,"same-seed-different-instance");
  assert.equal(await commitCheckpoint(another,another.world.events,2),true);
  assert.equal((await loadSavedRuns()).length,2);
  assert.equal((await loadEventPage(another.runInstanceId)).length,initial.world.events.length);
});

test("aborted evidence transaction leaves the previous checkpoint and ledger intact", async () => {
  await clearDB(); const initial=envelope(); await commitCheckpoint(initial,initial.world.events,null);
  const result=advanceSurvivalRun(initial.world,1); const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args) { const request=put.apply(this,args); if(this.name==="events") queueMicrotask(()=>{ try {this.transaction.abort();} catch { /* already aborted */ } }); return request; };
  try { await assert.rejects(commitCheckpoint(envelope(result.state,2),result.events,1)); }
  finally { IDBObjectStore.prototype.put=put; }
  assert.deepEqual(await loadCheckpoint(),initial);
  assert.equal((await loadEventPage("run-a")).length,initial.world.events.length);
});

test("queued observer command cannot retarget a replacement study", async () => {
  await clearDB(); const first = envelope(); await commitCheckpoint(first, first.world.events, null);
  let release;
  const lock = new Promise(resolve => { release = resolve; });
  const queued = lock.then(() => loadCommandCheckpoint(first.runInstanceId));
  const replacement = envelope(first.world, 2, "replacement-study");
  await commitCheckpoint(replacement, replacement.world.events, 1);
  release();
  await assert.rejects(queued, /study changed/);
  assert.deepEqual(await loadCheckpoint(), replacement);
});

test("frozen history stays contiguous when the hot tail moves and older pages arrive", () => {
  const events = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => ({ id: `event-${start + i}` }));
  const hot = events(1000, 1511);
  const frozen = extendHistoryWindow(hot, events(744, 999));
  const newHot = events(1100, 1611);
  assert.equal(newHot.at(-1).id, "event-1611");
  assert.equal(frozen.at(-1).id, "event-1511");
  const older = extendHistoryWindow(frozen, events(488, 743));
  assert.deepEqual(older.map(e => e.id), events(488, 1511).map(e => e.id));
  assert.equal(extendHistoryWindow(older, events(488, 743)).length, older.length);
});

test("export is bounded by its captured checkpoint cursor and missing-history boundary", async () => {
  await clearDB(); const first=envelope(); await commitCheckpoint(first,first.world.events,null);
  const result=advanceSurvivalRun(first.world,10); await commitCheckpoint(envelope(result.state,2),result.events,1);
  const capture={...first,missingBefore:1};
  const archive=JSON.parse(await exportRunArchive(capture));
  assert.ok(archive.events.every(e=>Number(e.id.slice(6))>1 && Number(e.id.slice(6))<=first.world.eventWindow.totalEvents));
  assert.equal(archive.events.length,first.world.eventWindow.totalEvents-1);
});

test("corrupt active reads fail closed; explicit recovery preserves it and valid retention metadata", async () => {
  await clearDB(); const first=envelope(); await commitCheckpoint(first,first.world.events,null);
  const result=advanceSurvivalRun(first.world,2); await commitCheckpoint(envelope(result.state,2),result.events,1);
  const db=await rawDB(); const broken={...envelope(result.state,2),speed:999,missingBefore:1};
  await writeRaw(db,"active",broken);
  await assert.rejects(loadCheckpoint(),/invalid/);
  await assert.rejects(commitCheckpoint(envelope(result.state,3),[],2));
  const recovered=await recoverLastGoodCheckpoint();
  assert.equal(validateCheckpoint(recovered),true); assert.equal(recovered.revision,3); assert.equal(recovered.missingBefore,1);
  const stored=await new Promise(resolve=>{ const request=db.transaction("checkpoints").objectStore("checkpoints").getAllKeys();request.onsuccess=()=>resolve(request.result); });
  assert.ok(stored.some(key=>key.startsWith("unreadable:"))); db.close();
});

test("envelope validation rejects malformed revision, speed, identity and world", () => {
  const good=envelope(); assert.equal(validateCheckpoint(good),true);
  for(const change of [{revision:NaN},{speed:3},{runInstanceId:""},{world:null},{missingBefore:-1}]) assert.equal(validateCheckpoint({...good,...change}),false);
});

test("next-generation version fence survives both backup creation and recovery of an older backup", async () => {
  await clearDB();
  const world=createSurvivalRun("fence-recovery"); delete world.succession; delete world.survivalRevision; world.schemaVersion=1;
  const first=envelope(world); await commitCheckpoint(first,world.events,null);
  const fenced=envelope({...world,schemaVersion:2},2); await commitCheckpoint(fenced,[],1);
  const backup=await loadCheckpoint("last-good");
  assert.equal(backup.world.schemaVersion,2);
  assert.equal(backup.world.tick,world.tick);
  assert.deepEqual(backup.world.agents,world.agents);
  assert.equal((await recoverLastGoodCheckpoint()).world.schemaVersion,2);
  // Recovery also fences a backup produced by a pre-update client.
  const db=await rawDB(); await writeRaw(db,"last-good",first); db.close();
  assert.equal((await recoverLastGoodCheckpoint()).world.schemaVersion,2);
  assert.equal((await loadCheckpoint()).world.succession,undefined,"no past agent decision is invented by a version-only migration");
});

test("survival recovery fences old backups without inventing adoption or measurements", async () => {
  for (const policyVersion of [2,3]) {
    await clearDB();
    const old=createSurvivalRun(`recovery-backup-${policyVersion}`,{policyVersion});
    delete old.survivalRevision;old.schemaVersion=policyVersion;
    for(const agent of old.agents){delete agent.navigation;delete agent.survivalRecord;}
    const first=envelope(old);await commitCheckpoint(first,old.events,null);
    const advanced=advanceSurvivalRun(old,1);await commitCheckpoint(envelope(advanced.state,2),advanced.events,1);
    const backup=await loadCheckpoint("last-good");
    assert.equal(backup.world.schemaVersion,4,"older clients reject this format, including recovery");
    assert.equal(backup.world.survivalRevision,undefined);
    assert.deepEqual(backup.world,{...old,schemaVersion:4});
    const paused=setSurvivalRunPaused(backup.world,true);
    assert.deepEqual(advanceSurvivalRun(paused,1).state,paused);
    const adopted=advanceSurvivalRun(backup.world,1).state;
    assert.equal(adopted.survivalRevision,1);assert.ok(adopted.agents.every(a=>a.survivalRecord.since===1));
    assert.equal(adopted.events.filter(e=>e.facts.survivalRevision===1).length,1);
    // Also cover a last-good backup originally written by an older client.
    const db=await rawDB();await writeRaw(db,"last-good",first);db.close();
    const recovered=await recoverLastGoodCheckpoint();
    assert.deepEqual(recovered.world,{...old,schemaVersion:4});
    assert.equal(validateCheckpoint(recovered),true);
  }
});
