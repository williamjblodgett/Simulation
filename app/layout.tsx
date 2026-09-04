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
  title: "Wildgrid — Autonomous Survival Observatory",
  description:
    "Watch autonomous agents explore, gather, cooperate, and survive in a living 3D world.",
  openGraph: {
    title: "Wildgrid — Autonomous Survival Observatory",
    description:
      "Watch autonomous agents explore, gather, cooperate, and survive in a living 3D world.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Wildgrid — Autonomous Survival Observatory",
    description:
      "Watch autonomous agents explore, gather, cooperate, and survive in a living 3D world.",
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
