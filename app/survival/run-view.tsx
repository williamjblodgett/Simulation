"use client";

import { AlertTriangle, ChevronDown, Clock3, Pause, Play, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AgentLimit, ClimateVolatility, ResourceAbundance, SurvivalRunOptions, SurvivalRunState } from "../simulation/survival";
import { humanize } from "./presentation";
import styles from "./survival-experience.module.css";
import { SavedStudies } from "./saved-studies";
import { useSurvivalRuntime, type PlaybackSpeed } from "./use-survival-runtime";
import { getHabitatPreview, getServerHabitatPreview, subscribeHabitatPreview } from "./portraits";
import { AgentAdmission } from "./agent-admission";
import { MaterialWorldRecord } from "./material-record";

interface RunViewProps {
  methodHref?: string;
  planetHref?: string;
  world: SurvivalRunState;
  storageStatus: "saved-on-device" | "save-unavailable";
  onStart(options: SurvivalRunOptions, seed?: string): Promise<void>;
}

export function RunView({ world, storageStatus, onStart, methodHref = "/about", planetHref = "/planet" }: RunViewProps) {
  const runtime = useSurvivalRuntime();
  const habitatPreview = useSyncExternalStore(subscribeHabitatPreview, getHabitatPreview, getServerHabitatPreview);
  const [setupOpen, setSetupOpen] = useState(false);
  const [agentCount, setAgentCount] = useState<AgentLimit>(3);
  const [abundance, setAbundance] = useState<ResourceAbundance>("balanced");
  const [climate, setClimate] = useState<ClimateVolatility>("variable");
  const [continuity,setContinuity]=useState(false);
  const [seed, setSeed] = useState("");
  const [starting, setStarting] = useState(false);
  const [extending, setExtending] = useState(false);
  const [addMessage, setAddMessage] = useState("");
  const confirmRef = useRef<HTMLDialogElement>(null);
  const screenRef = useRef<HTMLElement>(null);
  useEffect(() => { screenRef.current?.scrollTo({ top: 0 }); }, [setupOpen]);
  const living = world.agents.filter(({ alive }) => alive).length;
  const remainingMinutes = world.config.durationHours === null ? null : Math.max(0, world.config.durationHours * 60 - world.elapsedMinutes);

  function requestStart() {
    if (starting) return;
    if (world.status !== "completed" && world.status !== "extinct") {
      confirmRef.current?.showModal();
      return;
    }
    startNow();
  }

  async function startNow() {
    if (starting) return;
    setStarting(true);
    confirmRef.current?.close();
    try {
      await onStart({
        policyVersion: 4,
        materialFoundation: "geology-v1",
        knowledgeFoundation: "materials-v1",
        affectModel: "adaptive-v1",
        continuity,
        agentCount,
        agentCap: 5,
        durationHours: null,
        resourceAbundance: abundance,
        climateVolatility: climate,
      }, seed.trim() || undefined);
    } catch { setAddMessage("The new run could not be saved. The previous study is intact."); }
    finally { setStarting(false); }
  }

  async function continueIndefinitely() {
    if (extending) return;
    setExtending(true);
    try {
      await runtime.continueIndefinitely();
      setAddMessage("This study is now open-ended. Its modeled clock has no automatic finish.");
    } catch {
      setAddMessage("The run length could not be changed. The previous saved study is intact.");
    } finally {
      setExtending(false);
    }
  }

  return <section ref={screenRef} className={`${styles.screenView} ${setupOpen ? styles.setupScreen : ""}`} aria-labelledby="run-heading">
    <header className={styles.screenHeading}><div><span>{setupOpen ? "Configure an environment" : "Observation controls"}</span><h1 id="run-heading">{setupOpen ? "New run" : "Your study"}</h1><p>Set the world and goal. Agents make the decisions. New studies are open-ended.</p></div></header>

    <section className={styles.runStatus} hidden={setupOpen}>
      {habitatPreview ? <figure className={`${styles.environmentPreview} ${styles.runPreview}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={habitatPreview} alt="Captured scene of this study's habitat"/><figcaption><strong>Wooded basin</strong><span>Current study · captured view</span></figcaption>
      </figure> : null}
      <div className={styles.runStatusHeading}><span data-status={world.status} /><div><small>Current run</small><strong>{humanize(world.status)}</strong></div></div>
      <p className={styles.inlineNotice}>{world.config.knowledgeFoundation==="materials-v1"?"Material learning + protection discovery · agents can independently test fuel preparation, separation, heat containment, ore reduction, hot working and degrading tools. Outcomes follow world rules; no invention is guaranteed.":world.policyVersion===4?"Protection & support discovery · private goals, contextual learning, local measurements and evidence-backed procedures. No particular invention is guaranteed.":world.policyVersion===3?"Preserved physical construction policy 3. Its original sensing and experiment rules are unchanged; new runs use policy 4.":"Preserved earlier study · this run does not use physical construction. Configure a new run below to observe the updated agents; this study will remain in your device archive."}</p>
      <div className={styles.runPlayback}><button type="button" disabled={runtime.busy || ["completed","extinct"].includes(world.status)} onClick={() => void runtime.setPaused(world.status !== "paused").catch(() => {})}>{world.status === "paused" ? <Play size={19}/> : <Pause size={19}/>} {world.status === "paused" ? "Resume observation" : "Pause observation"}</button><label>Speed<select aria-label="Run playback speed" value={runtime.speed} disabled={["completed","extinct"].includes(world.status)} onChange={e=>runtime.setSpeed(Number(e.target.value) as PlaybackSpeed)}>{([.5,1,2,4] as const).map(speed=><option key={speed} value={speed}>{speed}×</option>)}</select></label></div>
      <dl><div><dt>Goal</dt><dd>{world.config.objective.statement}</dd></div><div><dt>Elapsed</dt><dd>{Math.floor(world.elapsedMinutes / 60)}h {world.elapsedMinutes % 60}m modeled time</dd></div><div><dt>Survivors</dt><dd>{living} of {world.agents.length} admitted lives</dd></div><div><dt>Environment</dt><dd>{humanize(world.config.resourceAbundance)} resources · {humanize(world.config.climateVolatility)} climate</dd></div><div><dt>Record</dt><dd>{storageStatus === "saved-on-device" ? "Saved on this device" : "Save unavailable · advancement stopped"}</dd></div><div><dt>Run length</dt><dd>{remainingMinutes === null ? "Open-ended · no automatic finish" : `${Math.floor(remainingMinutes / 60)}h ${remainingMinutes % 60}m remain in this preserved finite study`}</dd></div></dl>
      {world.config.durationHours !== null && world.status !== "completed" ? <section className={styles.durationCorrection} aria-label="Run length">
        <div><strong>Continue this study without an end date</strong><p>This run was created with the earlier finite setting. Changing its horizon will not alter its agents, clock, memories, or world.</p></div>
        <button type="button" disabled={runtime.busy || extending} onClick={() => void continueIndefinitely()}>{extending ? "Saving…" : "Continue indefinitely"}</button>
      </section> : null}
      <details><summary>Study model &amp; seed</summary><p>Policy {world.policyVersion ?? 1} · {world.physical ? "Physical materials, private learning and self-proposed projects" : "Preserved original decision model"}. {world.config.affectModel==="adaptive-v1"?"Persistent affective signals are enabled and disclosed; they are bounded decision weights, not consciousness. ":""}Seed: {world.seedLabel}. Runs while this browser is active, including while you read About.</p>{!world.physical?<p>This study keeps its original rules. Configure a new run to observe physical construction and self-proposed experiments; the current study will remain archived.</p>:<p>{world.physical?.parts.length??0} physical parts · {world.physical?.joints.length??0} connections · {world.physical?.tests??0} structural tests · {world.materials?.operations??0} material-process interventions. Material and search limits keep this a bounded model, not unrestricted general intelligence.</p>}</details>
      <AgentAdmission world={world}/>
      <MaterialWorldRecord world={world}/>
      <section className={styles.successionSummary}><h2>Next generations</h2><p>{Boolean(world.physical)&&!world.config.continuity?"Survival-only study. Autonomous succession is disabled; you can still introduce an agent as a recorded intervention.":world.policyVersion === 2 || Boolean(world.physical) ? "Optional continuity objective enabled. Agents can reserve supplies for a successor before their own death, or sponsor one after observing another death. They may decline or wait." : "This preserved early policy only considers a companion when one survivor remains."}</p><p>{world.succession?.plans.filter(p => p.status === "pending").length ?? 0} planned · {world.succession?.plans.filter(p => p.status === "fulfilled").length ?? 0} entered</p><small>These are modeled new-agent admissions, not biological reproduction or resurrection.</small></section>
      {addMessage ? <p className={styles.inlineNotice} role="status">{addMessage}</p> : null}
      {world.status === "completed" || world.status === "extinct" ? <div className={styles.outcomeSummary}><strong>Run outcome</strong><p>{world.status === "completed" ? `${living} agent${living === 1 ? "" : "s"} survived this preserved finite study. Completed records remain final; configure a new open-ended study to continue observing.` : "No agents remain alive. Open-ended does not make agents immortal; you may explicitly introduce another agent without resetting the world."}</p><small>{world.stats.decisions} decisions · {world.physical?.tests??world.stats.experiments} experiments · {world.physical?`${world.agents.reduce((n,a)=>n+(a.discovery?.procedures.length??a.physicalMind?.procedures.length??0),0)} retained prototype procedures`:`${world.stats.discoveries} discoveries`} · {world.stats.deaths} deaths</small></div> : null}
    </section>

    {!setupOpen ? <div className={styles.runLinks}><a className={styles.methodLink} href={methodHref}>How agent autonomy works</a><a className={styles.methodLink} href={planetHref}>Open the prior planetary study</a></div> : null}
    <button className={setupOpen ? styles.configureBack : styles.startButton} type="button" aria-expanded={setupOpen} onClick={() => setSetupOpen(value => !value)}>{setupOpen ? "Back to current run" : "Configure a new run"}</button>
    {setupOpen ? <section className={styles.newRun}>
      <figure className={styles.environmentPreview}>
        {/* A local canvas data URL; an image optimization server cannot improve this capture. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {habitatPreview ? <img src={habitatPreview} alt="A captured view of the current wooded habitat" /> : null}
        <figcaption><strong>Wooded basin</strong><span>Fresh water · Layout varies with seed</span><small>{habitatPreview ? "Current habitat capture · not a preview of the next seed" : "A shared environment with water, vegetation and stone"}</small></figcaption>
      </figure>
      <fieldset className={styles.agentSelector}><legend>Starting agents</legend><div>{([1,2,3,4,5] as AgentLimit[]).map((count) => <button type="button" key={count} data-selected={agentCount === count} aria-pressed={agentCount === count} onClick={() => setAgentCount(count)}><span>{count}</span><small>{count === 1 ? "agent" : "agents"}</small></button>)}</div></fieldset>
      <p className={styles.inlineNotice}>Mechanism foundation: 28 finite mineral families plus executable charcoal preparation, source-specific separation, fired heat containment, copper/iron reduction, hot working, ceramics and degrading tools. Exact composition and successful operating ranges must be learned; powered machines and electronics remain future world rules.</p>
      <p className={styles.inlineNotice}><strong>Open-ended study.</strong> There is no modeled time limit. It advances whenever this browser has an active Simulation tab; closing every tab pauses it rather than simulating unseen history.</p>
      <div className={styles.setupGrid}>
        <label><span>Resources</span><select value={abundance} onChange={(event) => setAbundance(event.target.value as ResourceAbundance)}><option value="scarce">Scarce</option><option value="balanced">Balanced</option><option value="plentiful">Plentiful</option></select></label>
        <label><span>Climate</span><select value={climate} onChange={(event) => setClimate(event.target.value as ClimateVolatility)}><option value="stable">Stable</option><option value="variable">Variable</option><option value="harsh">Harsh</option></select></label>
        <label><span>Agent objective</span><select value={continuity?"continuity":"survival"} onChange={e=>setContinuity(e.target.value==="continuity")}><option value="survival">Individual survival only</option><option value="continuity">Survival + optional next generation</option></select></label>
      </div>
      <div className={styles.fixedGoal}><ShieldCheck size={18} /><div><span>Primary goal</span><strong>Survive as long as possible.</strong><small>After repeated work, agents may compare a capability experiment with immediate survival actions using its estimated material, time, risk and physiological cost. General affective signals adapt from lived conditions but never force novelty or a named invention. {continuity?"Optional continuity is also enabled.":"No continuity reward is enabled."} You can add agents later, up to five living.</small></div></div>
      <details className={styles.advancedSetup}><summary><ChevronDown size={16} /> Advanced configuration</summary><label><span>Seed</span><input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="Generated automatically" autoComplete="off" /><small>Use the same seed and settings to reproduce a run.</small></label></details>
      {addMessage ? <p className={styles.inlineNotice} role="status">{addMessage}</p> : null}
    </section> : null}
    {setupOpen ? <button className={styles.startButton} type="button" onClick={requestStart} disabled={starting}>{starting ? <Clock3 size={19} /> : <RotateCcw size={19} />}{starting ? "Initializing…" : "Start simulation"}</button> : null}
    {!setupOpen ? <><p className={styles.saveDetails}>Last saved {runtime.lastSavedAt ? new Date(runtime.lastSavedAt).toLocaleTimeString() : "not yet"}. Single-writer ownership is coordinated between tabs; saves are revision-checked.</p><SavedStudies activeId={runtime.runInstanceId} /></> : null}

    <dialog className={styles.confirmDialog} ref={confirmRef} aria-labelledby="replace-run-dialog-title" onCancel={() => confirmRef.current?.close()}>
      <button type="button" aria-label="Close confirmation" onClick={() => confirmRef.current?.close()}><X size={18} /></button>
      <AlertTriangle size={24} />
      <h2 id="replace-run-dialog-title">Replace the active run?</h2>
      <p>A new study will become active. The previous checkpoint and retained history remain in this device&apos;s archive. The planetary studies are not affected.</p>
      <div><button type="button" onClick={() => confirmRef.current?.close()}>Keep current run</button><button type="button" disabled={starting} onClick={startNow}>Replace and start</button></div>
    </dialog>
  </section>;
}
