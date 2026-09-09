import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SurvivalRuntimeProvider } from "./survival/use-survival-runtime";

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
  title: {
    default: "Simulation · Autonomous survival experiment",
    template: "%s",
  },
  description:
    "Observe up to five autonomous agents attempt to survive, learn, cooperate, and research in a shared 3D habitat.",
  openGraph: {
    title: "Simulation · Autonomous survival experiment",
    description:
      "Set the environment and one goal. The agents make the survival decisions.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Simulation · Autonomous survival experiment",
    description:
      "Set the environment and one goal. The agents make the survival decisions.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080d12",
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
        <SurvivalRuntimeProvider>{children}</SurvivalRuntimeProvider>
      </body>
    </html>
  );
}
