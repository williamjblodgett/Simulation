"use client";

import { AlertTriangle, HeartPulse } from "lucide-react";
import { useSyncExternalStore } from "react";
import { getPortraits, getServerPortraits, subscribePortraits } from "./portraits";
import type { SurvivalActionKind, SurvivalAgent, SurvivalNeeds } from "../simulation/survival";
import { SURVIVAL_AGENT_COLORS, type SurvivalAgentId } from "./scene";
import styles from "./survival-experience.module.css";

export const AGENT_IDS = ["A1", "A2", "A3", "A4", "A5"] as const;

export function agentColor(id: string) {
  return SURVIVAL_AGENT_COLORS[id as SurvivalAgentId] ?? "#a6b4c3";
}

export function humanize(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatClock(totalMinutes: number) {
  const minutes = Math.floor(totalMinutes % 60);
  const hours = Math.floor((totalMinutes / 60) % 24);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function actionLabel(action: SurvivalActionKind) {
  const labels: Partial<Record<SurvivalActionKind, string>> = {
    move: "Moving",
    collect: "Collecting supplies",
    drink: "Drinking",
    eat: "Eating",
    rest: "Resting",
    warm: "Warming up",
    shelter: "Using shelter",
    build: "Building shelter",
    explore: "Exploring",
    gather: "Gathering materials",
    prepare_experiment: "Preparing an experiment",
    test_hypothesis: "Testing a hypothesis",
    review_evidence: "Reviewing evidence",
    share: "Sharing supplies",
    request: "Requesting help",
    cooperate: "Cooperating",
    wait: "Awaiting a decision",
  };
  return labels[action] ?? humanize(action);
}

export function activityLabel(agent: SurvivalAgent) {
  if (!agent.alive) return agent.causeOfDeath ? `Died · ${agent.causeOfDeath}` : "Historical record";
  if (agent.currentAction.status === "awaiting_decision") return "Awaiting decision";
  if (agent.currentAction.status === "blocked") return `Blocked · ${actionLabel(agent.currentAction.kind)}`;
  if (agent.currentAction.status === "resting") return "Resting";
  return actionLabel(agent.currentAction.kind);
}

export function mostImportantCondition(agent: SurvivalAgent) {
  if (!agent.alive) return { label: agent.causeOfDeath ? `Died · ${agent.causeOfDeath}` : "Died", value: 0, key: "health" as keyof SurvivalNeeds };
  const entries = Object.entries(agent.needs) as Array<[keyof SurvivalNeeds, number]>;
  const [key, value] = entries.sort((left, right) => left[1] - right[1])[0];
  const label = value < 28 ? `${humanize(key)} critical` : value < 48 ? `${humanize(key)} low` : "Condition stable";
  return { label, value, key };
}

export function AgentPortrait({ id, name, size = "normal" }: { id: string; name?: string; size?: "small" | "normal" | "large" }) {
  const images = useSyncExternalStore(subscribePortraits, getPortraits, getServerPortraits);
  // Tiny renderer-generated data URLs require no network or image optimization service.
  // eslint-disable-next-line @next/next/no-img-element
  return <span className={styles.portrait} data-size={size} style={{ "--agent-color": agentColor(id) } as React.CSSProperties} aria-hidden="true">{images[id] ? <img src={images[id]} alt="" title={name} /> : <b>{id}</b>}</span>;
}

export function NeedMeter({ label, value, compact = false }: { label: string; value: number; compact?: boolean }) {
  const status = value < 28 ? "critical" : value < 50 ? "warning" : "positive";
  return <div className={styles.needMeter} data-compact={compact} data-status={status}>
    <div><span>{label}</span><strong>{Math.round(value)}%</strong></div>
    <div className={styles.meterTrack} aria-label={`${label}: ${Math.round(value)} percent, higher is better`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
  </div>;
}

export function ConditionLine({ agent }: { agent: SurvivalAgent }) {
  const condition = mostImportantCondition(agent);
  const Icon = condition.value < 48 ? AlertTriangle : HeartPulse;
  return <span className={styles.conditionLine} data-critical={condition.value < 28} data-warning={condition.value >= 28 && condition.value < 48}><Icon size={13} />{condition.label}</span>;
}
