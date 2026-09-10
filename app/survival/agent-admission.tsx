"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import type { SurvivalRunState } from "../simulation/survival";
import { useSurvivalRuntime } from "./use-survival-runtime";
import styles from "./survival-experience.module.css";

export function AgentAdmission({ world }: { world: SurvivalRunState }) {
  const runtime = useSurvivalRuntime();
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const full = world.stats.livingAgents >= 5;
  const complete = world.status === "completed";
  async function add() {
    if (adding || runtime.busy || full || complete) return;
    setAdding(true); setMessage("");
    try {
      const result = await runtime.addAgent();
      setMessage(result?.ok ? `${result.agent!.name} entered the habitat. Your intervention is in the Timeline.` : result?.reason === "agent_cap_reached" ? "All five living-agent slots are now occupied." : "This study has ended. Configure a new run to introduce agents.");
    } catch { setMessage("The new agent could not be saved. No introduction was confirmed; retry when storage is available."); }
    finally { setAdding(false); }
  }
  return <section className={styles.admission} aria-label="Introduce an agent">
    <div><strong>{world.stats.livingAgents} of 5 living agents</strong><p>{complete ? "The observation period has ended. Configure another run to continue." : full ? "The habitat is full. A death will make room for another life." : "Add an independent agent without restarting. This is a recorded observer intervention."}</p></div>
    <button type="button" disabled={full || complete || adding || runtime.busy || runtime.storageStatus === "save-unavailable"} onClick={add}><Plus size={18}/>{adding ? "Adding…" : "Add agent"}</button>
    {message ? <p className={styles.admissionMessage} role="status">{message}</p> : null}
  </section>;
}
