import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Styleguide from "./Styleguide";

export const metadata: Metadata = {
  title: "Design system · GridLock Atlas",
  robots: { index: false, follow: false },
};

/** Dev-only living reference for the v2 design system (tokens + every primitive in components/ui.tsx). */
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Styleguide />;
}
