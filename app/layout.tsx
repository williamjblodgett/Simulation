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
  title: "WildGrid: Planetfall — Autonomous Planetary Observatory",
  description:
    "Observe a living planet where autonomous agents survive, cooperate, invent, form beliefs, found societies, and write their own history.",
  openGraph: {
    title: "WildGrid: Planetfall — Autonomous Planetary Observatory",
    description:
      "Ten thousand possible lives, one persistent world, and no player directing their fate.",
    type: "website",
    images: [
      {
        url: "/og-era3.png",
        width: 1536,
        height: 1024,
        alt: "WildGrid Planetfall world with autonomous societies across a luminous planet",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WildGrid: Planetfall — Autonomous Planetary Observatory",
    description:
      "Ten thousand possible lives, one persistent world, and no player directing their fate.",
    images: ["/og-era3.png"],
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
