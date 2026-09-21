import type { Metadata } from "next";
import { Geist, Geist_Mono, Barlow, Barlow_Condensed } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Richtung B (CP-JK-105): kondensierte Display-Schrift über ruhigem Fließtext.
// Beide Schnitte stammen aus derselben Familie — die Unterscheidung trägt die
// Breite, nicht ein Stilbruch. Mandanten im Theme "classic" (KSV) rühren diese
// Variablen nicht an und rendern unverändert mit Geist.
const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: 'KSV Baunatal – Fußballschule',
  description: 'Fußballschule KSV Baunatal – Sommercamps für Kinder und Jugendliche.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} ${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
