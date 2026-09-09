import type { Metadata } from "next";
import { HistoryBook } from "../history-book";

export const metadata: Metadata = {
  title: "Prior Living History | Simulation",
  description:
    "Read the preserved civilization study as a living history book, with an evidence-based chapter covering every 200 days.",
  openGraph: {
    title: "Prior Living History | Simulation",
    description:
      "A continuously written history of the prior study's powers, discoveries, conflicts, beliefs, lives, and changing identities.",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "Simulation prior autonomous civilization frontier",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Prior Living History | Simulation",
    description:
      "A continuously written history of the prior study's powers, discoveries, conflicts, beliefs, lives, and changing identities.",
    images: ["/og.png"],
  },
};

export default function HistoryPage() {
  return <HistoryBook />;
}
