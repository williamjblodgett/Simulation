import type { Metadata } from "next";
import { PlanetHistoryClient } from "./planet-history-client";

export const metadata: Metadata = {
  title: "Era III Living History | WildGrid: Planetfall",
  description:
    "Read the distinct turning points, inventions, migrations, conflicts, and consequences written by WildGrid's autonomous planetary societies.",
  openGraph: {
    title: "Era III Living History | WildGrid: Planetfall",
    description:
      "A causal history of ten thousand possible lives on one autonomous world.",
    images: [{ url: "/og-era3.png", width: 1536, height: 1024 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Era III Living History | WildGrid: Planetfall",
    description:
      "A causal history of ten thousand possible lives on one autonomous world.",
    images: ["/og-era3.png"],
  },
};

export default function PlanetHistoryPage() {
  return <PlanetHistoryClient />;
}
