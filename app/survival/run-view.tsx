"use client";

import { AlertTriangle, ChevronDown, Clock3, Plus, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useRef, useState } from "react";
import type { AddObserverAgentResult, AgentLimit, ClimateVolatility, ResourceAbundance, SurvivalRunOptions, SurvivalRunState } from "../simulation/survival";
import { formatClock, humanize } from "./presentation";
import styles from "./survival-experience.module.css";

interface RunViewProps {
  world: SurvivalRunState;
  storageStatus: "saved-on-device" | "memory-only";
  onStart(options: SurvivalRunOptions, seed?: string): void;
  onAddAgent(): AddObserverAgentResult | null;
}

export function RunView({ world, storageStatus, onStart, onAddAgent }: RunViewProps) {
  const [agentCount, setAgentCount] = useState<AgentLimit>(3);
  const [duration, setDuration] = useState("72");
  const [abundance, setAbundance] = useState<ResourceAbundance>("balanced");
  const [climate, setClimate] = useState<ClimateVolatility>("variable");
  const [seed, setSeed] = useState("");
  const [starting, setStarting] = useState(false);
  const [addMessage, setAddMessage] = useState("");
  const confirmRef = useRef<HTMLDialogElement>(null);
  const living = world.agents.filter(({ alive }) => alive).length;
  const hasVacancyFromDeath = world.agents.some(({ alive }) => !alive);
  const canAdd = hasVacancyFromDeath && living !== 1 && living < world.config.agentCap && world.status !== "completed";
  const remainingMinutes = world.config.durationHours === null ? null : Math.max(0, world.config.durationHours * 60 - world.elapsedMinutes);

  function requestStart() {
    if (starting) return;
    if (world.status !== "completed" && world.status !== "extinct") {
      confirmRef.current?.showModal();
      return;
    }
    startNow();
  }

  function startNow() {
    setStarting(true);
    confirmRef.current?.close();
    window.setTimeout(() => {
      onStart({
        agentCount,
        agentCap: agentCount,
        durationHours: duration === "open" ? null : Number(duration),
        resourceAbundance: abundance,
        climateVolatility: climate,
      }, seed.trim() || undefined);
      setStarting(false);
    }, 0);
  }

  function addAgent() {
    const result = onAddAgent();
    setAddMessage(result?.ok ? `${result.agent?.label ?? "A new agent"} entered the habitat. The intervention was recorded.` : result?.reason === "agent_cap_reached" ? "The configured agent limit has been reached." : result?.reason === "sole_survivor_decides" ? "The sole survivor owns this decision." : result?.reason === "replacement_not_available" ? "A replacement becomes available only after a death." : "This run can no longer accept an agent.");
  }

  return <section className={styles.screenView} aria-labelledby="run-heading">
    <header className={styles.screenHeading}><div><span>Observation conditions</span><h1 id="run-heading">Run</h1><p>Configure the environment and goal. Agents make the survival decisions.</p></div></header>

    <section className={styles.runStatus}>
      <div><span data-status={world.status} /><div><small>Current run</small><strong>{humanize(world.status)}</strong></div></div>
      <dl><div><dt>Goal</dt><dd>{world.config.objective.statement}</dd></div><div><dt>Elapsed</dt><dd>Day {world.day} · {formatClock(world.elapsedMinutes)}</dd></div><div><dt>Survivors</dt><dd>{living} of {world.config.agentCap}</dd></div><div><dt>Environment</dt><dd>{humanize(world.config.resourceAbundance)} resources · {humanize(world.config.climateVolatility)} climate</dd></div><div><dt>Record</dt><dd>{storageStatus === "saved-on-device" ? "Saved on this device" : "Memory only · storage unavailable"}</dd></div><div><dt>Seed</dt><dd>{world.seedLabel}</dd></div><div><dt>Remaining</dt><dd>{remainingMinutes === null ? "Open-ended" : `${Math.floor(remainingMinutes / 60)}h ${remainingMinutes % 60}m modeled time`}</dd></div></dl>
      {canAdd ? <div className={styles.addAgentArea}><div><strong>One habitat slot is empty</strong><p>Introducing an agent is an observer intervention. The new agent receives no chosen role, strategy, memories, or personality.</p>{living === 1 ? <small>The sole survivor may also independently decide whether to request one companion.</small> : null}</div><button type="button" onClick={addAgent}><Plus size={18} /> Introduce one agent</button></div> : null}
      {living === 1 && hasVacancyFromDeath && world.config.agentCap > 1 ? <div className={styles.addAgentArea}><div><strong>The decision belongs to the sole survivor</strong><p>{world.soleSurvivor.rationale ?? "If the population fell from several agents to one, that agent may independently request one companion or remain alone."}</p></div></div> : null}
      {addMessage ? <p className={styles.inlineNotice} role="status">{addMessage}</p> : null}
      {world.status === "completed" || world.status === "extinct" ? <div className={styles.outcomeSummary}><strong>Run outcome</strong><p>{world.status === "completed" ? `${living} agent${living === 1 ? "" : "s"} survived the configured observation period.` : "No agents remain alive. Agents shows the latest record for each habitat slot, and recent deaths remain in the bounded Timeline."}</p><small>{world.stats.decisions} decisions · {world.stats.experiments} experiments · {world.stats.discoveries} discoveries · {world.stats.deaths} deaths</small></div> : null}
    </section>

    <section className={styles.newRun}>
      <header><div><small>New experiment</small><h2>Set the starting conditions</h2></div><span>Default · 3 agents / 72 hours</span></header>
      <div className={styles.environmentPreview} aria-hidden="true"><i /><i /><i /><div><span>Fresh water</span><span>Wooded basin</span><span>{humanize(climate)} weather</span></div></div>
      <fieldset className={styles.agentSelector}><legend>Starting agents</legend><div>{([1,2,3,4,5] as AgentLimit[]).map((count) => <button type="button" key={count} data-selected={agentCount === count} aria-pressed={agentCount === count} onClick={() => setAgentCount(count)}><span>{count}</span><small>{count === 1 ? "agent" : "agents"}</small></button>)}</div></fieldset>
      <div className={styles.setupGrid}>
        <label><span>Survival duration</span><select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="24">24 modeled hours</option><option value="72">72 modeled hours</option><option value="168">7 modeled days</option><option value="open">Open-ended</option></select></label>
        <label><span>Resources</span><select value={abundance} onChange={(event) => setAbundance(event.target.value as ResourceAbundance)}><option value="scarce">Scarce</option><option value="balanced">Balanced</option><option value="plentiful">Plentiful</option></select></label>
        <label><span>Climate</span><select value={climate} onChange={(event) => setClimate(event.target.value as ClimateVolatility)}><option value="stable">Stable</option><option value="variable">Variable</option><option value="harsh">Harsh</option></select></label>
      </div>
      <div className={styles.fixedGoal}><ShieldCheck size={18} /><div><span>Fixed goal</span><strong>Survive as long as possible.</strong><small>This is the only pre-given objective.</small></div></div>
      <details className={styles.advancedSetup}><summary><ChevronDown size={16} /> Advanced configuration</summary><label><span>Seed</span><input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="Generated automatically" autoComplete="off" /><small>Use the same seed and settings to reproduce a run.</small></label></details>
      <button className={styles.startButton} type="button" onClick={requestStart} disabled={starting}>{starting ? <Clock3 size={19} /> : <RotateCcw size={19} />}{starting ? "Initializing…" : "Start simulation"}</button>
      <div className={styles.runLinks}><a className={styles.methodLink} href="/about">How agent autonomy works</a><a className={styles.methodLink} href="/planet">Open the prior planetary study</a></div>
    </section>

    <dialog className={styles.confirmDialog} ref={confirmRef} aria-labelledby="replace-run-dialog-title" onCancel={() => confirmRef.current?.close()}>
      <button type="button" aria-label="Close confirmation" onClick={() => confirmRef.current?.close()}><X size={18} /></button>
      <AlertTriangle size={24} />
      <h2 id="replace-run-dialog-title">Replace the active run?</h2>
      <p>The current survival run and its local timeline will be replaced. The preserved planetary studies are not affected.</p>
      <div><button type="button" onClick={() => confirmRef.current?.close()}>Keep current run</button><button type="button" onClick={startNow}>Replace and start</button></div>
    </dialog>
  </section>;
}
