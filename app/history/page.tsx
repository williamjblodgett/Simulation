import type { Metadata } from "next";
import { HistoryBook } from "../history-book";

export const metadata: Metadata = {
  title: "The Living History | Wildgrid: Sovereignty",
  description:
    "Read Wildgrid as a living history book, with a new evidence-based chapter covering every 200 days of autonomous civilization.",
  openGraph: {
    title: "The Living History | Wildgrid: Sovereignty",
    description:
      "A continuously written history of Wildgrid's powers, discoveries, conflicts, beliefs, lives, and changing identities.",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "Wildgrid Sovereignty autonomous civilization frontier",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Living History | Wildgrid: Sovereignty",
    description:
      "A continuously written history of Wildgrid's powers, discoveries, conflicts, beliefs, lives, and changing identities.",
    images: ["/og.png"],
  },
};

export default function HistoryPage() {
  return <HistoryBook />;
}
