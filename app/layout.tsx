import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";

// Geist for words, Geist Mono for every number, Instrument Serif italic only in the wordmark and the brief title.
// All three are cached by next/font at build/dev time, so the app runs offline.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Atlas",
  description:
    "Atlas compares public future construction plans from different power utilities, flags geographic proximity or schedule overlap, and shows the cited evidence behind every match.",
  applicationName: "Atlas",
};

export const viewport: Viewport = {
  themeColor: "#1f252d",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="h-full">{children}</body>
    </html>
  );
}
