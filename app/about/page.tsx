import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Brain, Eye, FlaskConical, GitBranch, HeartPulse, Scale } from "lucide-react";
import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "How agent autonomy works · Simulation",
  description: "How Simulation agents make survival decisions and choose whether to support a next generation.",
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
        <span>The original primary objective</span>
        <h2>Survive as long as possible.</h2>
        <p>Every agent starts from this same primary objective. No agent receives a preset personality, profession, job, faction, preferred strategy, religion, enemy, or scripted life story. New physical studies default to individual survival only. You can separately enable an optional continuity objective when configuring a run; agents then decide whether to fund a successor, with immediate survival taking priority.</p>
      </section>
      <section className={styles.cycle}>
        <div><p>ONE DECISION CYCLE</p><h2>What autonomy means here</h2></div>
        <div className={styles.grid}>{cycle.map(([Icon, title, copy], index) => <article key={title}><span>0{index + 1}</span><Icon size={21} /><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>
      <section className={styles.research}>
        <FlaskConical size={25} />
        <div><p>RESEARCH IS AN ACTION, NOT AN UNLOCK BUTTON</p><h2>Try an arrangement. Measure what happened.</h2><p>In policy 3, an agent can propose a project to reduce future exposure, obtain material, shape and position parts, join or modify observed objects, and test their consequences. It compares the predicted survival benefit with effort, risk, uncertainty and ordinary alternatives such as finding supplies or resting. Urgent needs can interrupt a project; failed parts remain in the world.</p><p>Wood, stone, fiber and clay have simplified mass, strength, insulation, porosity and heat properties. Geometry and connections determine support and protection—not a building name. Tests measure load, water retention or protection, including a modeled counterfactual for protection. Each agent keeps its own evidence and fallible estimates, can reuse an edited procedure, and can exchange a reported result with consent. One successful trial is not proof of a general invention.</p><p>The agent proposes within a supplied physical action language and a fixed search budget. The current project generator focuses on exposure, not arbitrary machine design. This is not full chemistry, rigid-body physics, electricity, or an unrestricted inventor. There is no API or hidden chatbot. Older studies keep their original rules; configure a new run to use policy 3.</p></div>
      </section>
      <section className={styles.boundary}>
        <h2>They learn arrangements, not a picture of a house.</h2>
        <p>Agents start with basic abilities to handle materials and imperfect expectations, not a catalog of buildings. They can reason about the shapes they have actually observed, look for clear supported positions and an approach, obtain missing materials, and return to unfinished work. An urgent need can interrupt construction. Repeated failures can make them revise or abandon a project.</p>
        <p>Resting near an arrangement creates an experience record. An agent can later choose to return there when it expects protection to help. This experience is distinct from a controlled material test: a warmer night does not prove a structure caused the improvement. Select a physical part to inspect its maker, project, measurements and recent use; dashed outlines show proposals, not completed buildings. The observer cannot approve a design or tell an agent to build it.</p>
        <h2>Autonomous does not mean conscious.</h2>
        <p>These are deterministic simulation agents with bounded perception, planning, uncertainty, memory, and outcome learning—not sentient beings and not hidden chatbots. Their recorded intent explains the simulation factors used in a decision; it is not private chain-of-thought.</p>
        <p>You can add an independent agent at any time before the observation period ends, up to five living agents. Additions are logged and do not restart the world. This also works after extinction.</p>
        <p>Death remains permanent. After gaining six modeled hours of experience, an agent can choose to reserve 0.5 food and 0.5 water for a successor, while retaining its own reserves. A living agent can also sponsor a successor after personally observing a death. It can decline or wait; a repeated random roll never forces the choice.</p>
        <p>A funded plan creates one new life after the predecessor dies and a slot is vacant, even if the plan was made before the last agent died. The supplies transfer once. The new agent has a lineage record but no inherited memories, research, personality or role. This is an abstract admission model—not biological reproduction, resurrection, or proof that an individual can benefit after death. The continuity preference is explicitly designed, not discovered intelligence. No new life is admitted after the configured observation duration ends.</p>
      </section>
    </main>
  );
}
