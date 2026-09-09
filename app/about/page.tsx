import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Brain, Eye, FlaskConical, GitBranch, HeartPulse, Scale } from "lucide-react";
import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "How agent autonomy works · Simulation",
  description: "A plain-language explanation of the Simulation survival agents, their one supplied goal, and how they decide what to do.",
};

const cycle = [
  [Eye, "Observe", "Each agent receives only nearby evidence: resources it has noticed, current conditions, other agents it has encountered, and remembered outcomes."],
  [Scale, "Compare", "It evaluates feasible actions against hydration, nutrition, energy, warmth, safety, uncertainty, relationships, and what worked before."],
  [GitBranch, "Act", "It chooses a goal, attempts its plan step by step, and can ask another agent to cooperate. The other agent may refuse."],
  [Brain, "Learn", "The confirmed outcome updates its expectations. Later choices can change because of experience, without assigning a personality."],
] as const;

export default function AboutPage() {
  return (
    <main className={styles.page}>
      <header><Link href="/"><ArrowLeft size={18} /> Back to Simulation</Link><span>Method / read-only</span></header>
      <section className={styles.hero}>
        <p>HOW THE EXPERIMENT WORKS</p>
        <h1>The environment is supplied.<br />The decisions are not.</h1>
        <div><p>You can set up a run, move the camera, change playback speed, and inspect records. You cannot tell an agent where to walk, what to gather, whom to trust, or which technology to pursue.</p><Link href="/">Observe the current run</Link></div>
      </section>
      <section className={styles.goal}>
        <HeartPulse size={26} />
        <span>The only pre-given objective</span>
        <h2>Survive as long as possible.</h2>
        <p>Every agent starts from this same broad objective. No agent receives a preset personality, profession, job, faction, preferred strategy, religion, enemy, or scripted life story.</p>
      </section>
      <section className={styles.cycle}>
        <div><p>ONE DECISION CYCLE</p><h2>What autonomy means here</h2></div>
        <div className={styles.grid}>{cycle.map(([Icon, title, copy], index) => <article key={title}><span>0{index + 1}</span><Icon size={21} /><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>
      <section className={styles.research}>
        <FlaskConical size={25} />
        <div><p>RESEARCH IS AN ACTION, NOT AN UNLOCK BUTTON</p><h2>Agents can choose to test a hypothesis.</h2><p>After observing useful materials or a recurring problem, an agent may gather inputs, run an experiment, record a failure, repeat a promising result, and establish a technique. Discoveries require local evidence and repeatable tests; they do not unlock merely because time passed.</p><p>The possible techniques and experiment procedures come from a bounded, authored research catalog. Autonomy lies in whether, when, and how an agent pursues an available test—not in inventing knowledge outside the simulation&apos;s rules.</p></div>
      </section>
      <section className={styles.boundary}>
        <h2>Autonomous does not mean conscious.</h2>
        <p>These are deterministic simulation agents with bounded perception, planning, uncertainty, memory, and outcome learning—not sentient beings and not hidden chatbots. Their recorded intent explains the simulation factors used in a decision; it is not private chain-of-thought.</p>
        <p>Death is permanent. The simulation never silently replaces an agent. After a death leaves a vacant configured slot, a user may explicitly introduce one new independent agent, and that intervention is logged. If exactly one survivor remains, that agent alone may decide whether to request one companion.</p>
      </section>
    </main>
  );
}
