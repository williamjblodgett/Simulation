import Link from "next/link";

export default function PlanetMethodPage() {
  return <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px", lineHeight: 1.7 }}>
    <Link href="/planet">← Return to the planetary study</Link>
    <h1>How the planetary study works</h1>
    <p>This is the preserved, large-scale study that preceded the five-agent survival habitat. Its local agents select from the implemented actions using needs, observations, learned outcomes and social conditions. No remote model or API key is required.</p>
    <p>Population, settlement growth, research and conflict emerge within authored simulation rules. Autonomy means independent decisions inside those rules—not consciousness, unrestricted invention or human reasoning. This study has a separate save and history.</p>
    <Link href="/">Open the current survival study</Link>
  </main>;
}
