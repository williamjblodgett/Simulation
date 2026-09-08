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
  title: "WildGrid — Autonomous World Observatory",
  description:
    "A persistent, inspectable simulation of autonomous lives forming families, settlements, knowledge, institutions, beliefs, and causal history without player control.",
  openGraph: {
    title: "WildGrid — Autonomous World Observatory",
    description:
      "Observe the evidence, choices, consequences, and history of a persistent world whose inhabitants cannot be commanded.",
    type: "website",
    images: [
      {
        url: "/og-era3-v2.png",
        width: 1536,
        height: 1024,
        alt: "WildGrid overhead field atlas recording autonomous societies and individual lives",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WildGrid — Autonomous World Observatory",
    description:
      "Observe the evidence, choices, consequences, and history of a persistent world whose inhabitants cannot be commanded.",
    images: ["/og-era3-v2.png"],
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
