import type { Metadata } from "next";
import { CivilizationArchive } from "../civilization-archive";

export const metadata: Metadata = {
  title: "World Archive | Wildgrid: Sovereignty",
  description:
    "Explore every civilization, belief system, founder, conflict, discovery, and defining moment in the persistent Wildgrid world.",
  openGraph: {
    title: "World Archive | Wildgrid: Sovereignty",
    description:
      "A living record of Wildgrid's civilizations, belief systems, founders, conflicts, discoveries, and defining moments.",
  },
  twitter: {
    title: "World Archive | Wildgrid: Sovereignty",
    description:
      "A living record of Wildgrid's civilizations, belief systems, founders, conflicts, discoveries, and defining moments.",
  },
};

export default function ArchivePage() {
  return <CivilizationArchive />;
}
