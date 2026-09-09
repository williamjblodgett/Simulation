import type { Metadata } from "next";
import { PlanetHistoryClient } from "./planet-history-client";

export const metadata: Metadata = {
  title: "Planetary Living History | Simulation",
  description:
    "Read the distinct turning points, inventions, migrations, conflicts, and consequences written by the prior planetary societies.",
  openGraph: {
    title: "Planetary Living History | Simulation",
    description:
      "A causal history of ten thousand possible lives on one autonomous world.",
    images: [{ url: "/og-era3-v2.png", width: 1536, height: 1024 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Planetary Living History | Simulation",
    description:
      "A causal history of ten thousand possible lives on one autonomous world.",
    images: ["/og-era3-v2.png"],
  },
};

export default function PlanetHistoryPage() {
  return <PlanetHistoryClient />;
}
