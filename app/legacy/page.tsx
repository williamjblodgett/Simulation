import type { Metadata } from "next";
import { SovereigntyExperience } from "../sovereignty-experience";

export const metadata: Metadata = {
  title: "Era II Archive | Simulation",
  description:
    "Observe the preserved Era II civilization from an earlier Simulation study.",
};

export default function LegacyWorldPage() {
  return <SovereigntyExperience />;
}
