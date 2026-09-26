import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next, Barlow_Semi_Condensed } from "next/font/google";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";

// Atkinson Hyperlegible Next for reading text and numbers (tabular figures), Barlow Semi Condensed for headings and
// title-block labels, Atkinson Hyperlegible Mono only for identifiers. All three are cached by next/font, so the app runs offline.
const atkinson = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"] });
const atkinsonMono = Atkinson_Hyperlegible_Mono({ variable: "--font-atkinson-mono", subsets: ["latin"] });
const barlow = Barlow_Semi_Condensed({ variable: "--font-barlow", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "GridLock Atlas — compare public utility construction plans",
  description:
    "GridLock Atlas compares public future construction plans from different power utilities, flags geographic proximity or schedule overlap, and shows the cited evidence behind every match.",
  applicationName: "GridLock Atlas",
};

export const viewport: Viewport = {
  themeColor: "#080e14",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${atkinson.variable} ${atkinsonMono.variable} ${barlow.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
