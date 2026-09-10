import assert from "node:assert/strict";
import test from "node:test";
import { SurvivalWorkerBridge } from "../app/survival/survival-worker-bridge.ts";
import { createSurvivalRun, advanceSurvivalRun } from "../app/simulation/survival/index.ts";

test("worker replies, cancellation, stale callbacks and clone failures are isolated", async () => {
  const original=globalThis.Worker, workers=[];
  class FakeWorker {
    constructor() { workers.push(this); }
    postMessage(message) { this.message=message; if(this.throwClone) throw new DOMException("Clone failed","DataCloneError"); }
    terminate() { this.terminated=true; }
  }
  globalThis.Worker=FakeWorker;
  const bridge=new SurvivalWorkerBridge(),world=createSurvivalRun("worker-test",{agentCount:1});
  try {
    const first=bridge.advance(world,24),worker=workers[0],result=advanceSurvivalRun(world,1);
    assert.equal(worker.message.steps,1,"catch-up cannot combine expensive decisions into one timed-out request");
    worker.onmessage({data:{id:worker.message.id,ok:true,result}});
    assert.deepEqual(await first,result); assert.equal(bridge.pending.size,0);
    worker.throwClone=true;
    await assert.rejects(bridge.advance(world,1),/Clone failed/); assert.equal(bridge.pending.size,0);
    worker.throwClone=false;
    const cancelled=bridge.advance(world,1); bridge.dispose(); await assert.rejects(cancelled,/cancelled/);
    const next=bridge.advance(world,1),replacement=workers[1];
    worker.onerror(); assert.equal(replacement.terminated,undefined);
    worker.onmessage({data:{id:replacement.message.id,ok:true,result:{bad:true}}});
    replacement.onmessage({data:{id:replacement.message.id,ok:true,result}});
    assert.deepEqual(await next,result); assert.equal(bridge.pending.size,0);
  } finally { bridge.dispose(); globalThis.Worker=original; }
});
