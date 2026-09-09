import type { SurvivalAdvanceResult, SurvivalRunState } from "../simulation/survival/types";

export class SurvivalWorkerBridge {
  private worker: Worker | null = null;
  private serial = 0;
  private pending = new Map<number, { resolve(value: SurvivalAdvanceResult): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  advance(world: SurvivalRunState, steps: number): Promise<SurvivalAdvanceResult> {
    if (!this.worker) {
      this.worker = new Worker(new URL("./survival-simulation.worker.ts", import.meta.url), { type: "module" });
      const worker = this.worker;
      this.worker.onmessage = event => {
        if (this.worker !== worker) return;
        const request = this.pending.get(event.data.id);
        if (!request) return;
        clearTimeout(request.timer); this.pending.delete(event.data.id);
        if (event.data.ok) request.resolve(event.data.result);
        else request.reject(new Error(event.data.error));
      };
      this.worker.onerror = () => { if (this.worker === worker) this.dispose("The local planner stopped. Retry from the last saved checkpoint."); };
    }
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      const timer = setTimeout(() => this.dispose("The local planner timed out. The last saved checkpoint is intact."), 15_000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.worker!.postMessage({ id, world, steps: Math.min(24, steps) }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  dispose(message = "Local planner request cancelled."): void {
    this.worker?.terminate(); this.worker = null;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error(message)); }
    this.pending.clear();
  }
}
