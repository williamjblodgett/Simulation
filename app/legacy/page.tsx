import type { Metadata } from "next";
import { SovereigntyExperience } from "../sovereignty-experience";

export const metadata: Metadata = {
  title: "Era II Archive | WildGrid",
  description:
    "Observe the preserved Era II civilization while WildGrid's planetary Era III unfolds.",
};

export default function LegacyWorldPage() {
  return <SovereigntyExperience />;
}
