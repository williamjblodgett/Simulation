import type { Metadata } from "next";
import { CivilizationArchive } from "../civilization-archive";

export const metadata: Metadata = {
  title: "Prior World Archive | Simulation",
  description:
    "Explore every civilization, belief system, founder, conflict, discovery, and defining moment in the preserved world study.",
  openGraph: {
    title: "Prior World Archive | Simulation",
    description:
      "A living record of the prior study's civilizations, belief systems, founders, conflicts, discoveries, and defining moments.",
  },
  twitter: {
    title: "Prior World Archive | Simulation",
    description:
      "A living record of the prior study's civilizations, belief systems, founders, conflicts, discoveries, and defining moments.",
  },
};

export default function ArchivePage() {
  return <CivilizationArchive />;
}
