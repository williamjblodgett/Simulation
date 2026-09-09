import type { Metadata } from "next";
import { PlanetExperience } from "../planet-experience";

export const metadata: Metadata = {
  title: "Prior planetary study · Simulation",
  description: "The preserved large-scale autonomous world that preceded the focused survival experiment.",
};

export default function PlanetStudyPage() {
  return <PlanetExperience archiveHref="/legacy" historyHref="/planet-history" methodHref="/about" />;
}
