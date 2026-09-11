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
  [Brain, "Learn", "The confirmed outcome updates expectations and persistent affective signals. Later choices can change because of experience, without assigning a personality class."],
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
      <section className={styles.boundary}>
        <div><h2>New studies: protection, support and material transformation</h2><p>Policy 4 keeps the inspectable learning loop and now adds a bounded material-processing foundation. An agent can recognize repeated work as a survival cost, form a goal to reduce that cost, gather a source-specific sample, prepare carbon-rich fuel, separate mineral-bearing rock, form a fired enclosure, attempt ore reduction, work a bloom and physically test a degrading tool. It may also abstain. Every intervention costs modeled time, energy and matter; unsuccessful heating still leaves residue, gas, slag or altered ore.</p><p>The authoritative world—not the agent’s wish—calculates attained temperature from fuel, fuel quality, airflow, charge mass, enclosure condition and duration. Hidden ore composition controls possible yield. The agent receives only coarse batch observations, broad fallible priors and its own measurements. A successful run can update a parameterized procedure; it never creates an unlock flag or bypasses later costs.</p><p>Developers supply senses, physiology, action capabilities, broad mechanism priors and world rules. Agents learn contextual effects, operating ranges and procedures within those limits; they are not blank minds. New policies receive an explicit runtime-filtered private snapshot, not the world seed, another agent’s private memory, exact chemistry, hidden coefficients or observer diagnostics. Experiments receive no reward simply for novelty. Ordinary survival may be preferable, and progress is not guaranteed. Loading an older study does not retrofit these systems. No API or external model is used.</p></div>
      </section>
      <section className={styles.research}>
        <FlaskConical size={25} />
        <div><p>RESEARCH IS AN ACTION, NOT AN UNLOCK BUTTON</p><h2>Try a process. Measure what happened.</h2><p>The world now implements a small family of related mechanisms: heat transfer, combustion and pyrolysis, source-specific separation, ceramic firing, refractory containment, copper and iron reduction, hot working, yield and waste, and tool wear. The same record distinguishes a prediction, the physical intervention, the measurement and the later decision it changes.</p><p>The smelting model explicitly accounts for normalized fuel and ore mass, estimated degrees Celsius, ore grade, reduction fraction, solid yield, slag, exhaust, hearth wear, tool durability, modeled minutes and physiological energy. It is deliberately simplified—not full thermodynamics or chemistry—but failure has consequences and every tracked input retains provenance through useful products and remnants.</p><p>This is a foundation for broader discovery, not modern industry. There are no powered machines, precision metrology, electrical circuits or semiconductor fabrication yet. The 28 geological families are possible raw inputs, not pure elements, and most still lack executable processing rules. More time does not automatically produce technology.</p></div>
      </section>
      <section className={styles.boundary}>
        <h2>They learn arrangements, not a picture of a house.</h2>
        <p>Agents start with basic abilities to handle materials and imperfect expectations, not a catalog of buildings. They can reason about the shapes they have actually observed, look for clear supported positions and an approach, obtain missing materials, and return to unfinished work. An urgent need can interrupt construction. Repeated failures can make them revise or abandon a project.</p>
        <p>Resting near an arrangement creates an experience record. An agent can later choose to return there when it expects protection to help. This experience is distinct from a controlled material test: a warmer night does not prove a structure caused the improvement. Select a physical part to inspect its maker, project, measurements and recent use; dashed outlines show proposals, not completed buildings. The observer cannot approve a design or tell an agent to build it.</p>
        <h2>Autonomous does not mean conscious.</h2>
        <p>These are deterministic simulation agents with bounded perception, planning, uncertainty, memory, outcome learning and adaptive control signals—not sentient beings and not hidden chatbots. “Caution,” frustration, confidence, inquiry and social need are numeric states derived from experienced danger, success, failure, uncertainty and isolation. They modestly reweight choices; they are not generated inner monologues, consciousness or fixed personality archetypes.</p>
        <p>Immediate survival remains dominant. Fear increases the value of safety actions and suppresses optional inquiry during danger. Frustration discourages costly repeated failures. Confidence can support acting on tested expectations. Inquiry only values information that could change an important decision while vital needs are stable; it does not reward novelty, experiment count or building count. The UI shows the factual drivers so this authored influence stays inspectable.</p>
        <h2>Why can an agent still die?</h2>
        <p>Its map and predictions can be incomplete or wrong. It compares multi-step plans, such as reaching water, collecting it, and drinking, and can reconsider when delay becomes dangerous. It learns from blocked routes and refused requests, but it cannot see another agent’s private inventory or guarantee that help will arrive. Better planning is not immortality.</p>
        <p>The death review shows recorded needs, confirmed consumption, route failures, and the final plan. These measurements help the observer investigate what happened; they do not feed the agent extra knowledge or reconstruct missing history.</p>
        <p>You can add an independent agent at any time in an open-ended study, up to five living agents. Additions are logged and do not restart the world. This also works after extinction.</p>
        <p>Death remains permanent. After gaining six modeled hours of experience, an agent can choose to reserve 0.5 food and 0.5 water for a successor, while retaining its own reserves. A living agent can also sponsor a successor after personally observing a death. It can decline or wait; a repeated random roll never forces the choice.</p>
        <p>A funded plan creates one new life after the predecessor dies and a slot is vacant, even if the plan was made before the last agent died. The supplies transfer once. The new agent has a lineage record but no inherited memories, research, personality or role. This is an abstract admission model—not biological reproduction, resurrection, or proof that an individual can benefit after death. The continuity preference is explicitly designed, not discovered intelligence. New studies have no duration boundary; preserved finite studies still honor their recorded end.</p>
        <p>Preserved active policy-2/3 studies adopt survival and navigation corrections on their next advancing tick with an audit event; paused and ended records are not rewritten. Material knowledge and adaptive state are different: they remain explicit new-study options and are never retrofitted into an older life.</p>
      </section>
    </main>
  );
}
