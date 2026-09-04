import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://wildgrid-ai-habitat.williamjblodgett.chatgpt.site"),
  title: "Wildgrid: Sovereignty — Autonomous Civilization Observatory",
  description:
    "Watch ten autonomous founders build camps, create lineages, advance technology, fracture, ally, and fight for power. Beliefs emerge, spread, reform, and split across a 200 × 200 frontier.",
  openGraph: {
    title: "Wildgrid: Sovereignty — Autonomous Civilization Observatory",
    description:
      "Watch ten autonomous founders build camps, create lineages, advance technology, fracture, ally, and fight for power. Beliefs emerge, spread, reform, and split across a 200 × 200 frontier.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "Wildgrid Sovereignty frontier with expanding autonomous camps and abstract belief networks",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wildgrid: Sovereignty — Autonomous Civilization Observatory",
    description:
      "Watch ten autonomous founders build camps, create lineages, advance technology, fracture, ally, and fight for power. Beliefs emerge, spread, reform, and split across a 200 × 200 frontier.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
