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
    "Watch ten autonomous founders build camps, create lineages, advance technology, fracture, ally, and fight for power.",
  openGraph: {
    title: "Wildgrid: Sovereignty — Autonomous Civilization Observatory",
    description:
      "Watch ten autonomous founders build camps, create lineages, advance technology, fracture, ally, and fight for power.",
    type: "website",
    images: [
      {
        url: "/wildgrid-sovereignty-og.png",
        width: 1792,
        height: 933,
        alt: "Wildgrid Sovereignty frontier with ten autonomous camps competing across a living world",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wildgrid: Sovereignty — Autonomous Civilization Observatory",
    description:
      "Watch ten autonomous founders build camps, create lineages, advance technology, fracture, ally, and fight for power.",
    images: ["/wildgrid-sovereignty-og.png"],
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
