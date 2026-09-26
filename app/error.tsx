"use client"; // Error boundaries must be Client Components

import { RotateCw } from "lucide-react";
import { useEffect } from "react";
import { Button, LogoMark } from "@/components/ui";

/** Route-level error boundary: one calm sentence and a Retry. The snapshot is bundled, so nothing is lost. */
export default function AtlasError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="relative grid h-dvh place-items-center overflow-hidden bg-canvas px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_42%,rgb(76_201_240/0.07),transparent_70%),radial-gradient(40%_40%_at_58%_58%,rgb(167_139_250/0.06),transparent_70%)]"
      />
      <section aria-labelledby="error-title" className="panel relative flex w-full max-w-[400px] flex-col items-center rounded-dialog px-8 py-9 text-center">
        <LogoMark size={40} />
        <h1 id="error-title" className="mt-5 text-heading font-semibold text-fg-1">
          Something went wrong drawing the atlas.
        </h1>
        <p className="mt-2 text-body text-pretty text-fg-2">Your plans and sources are bundled with the app — nothing was lost.</p>
        <Button variant="primary" size="lg" className="mt-6" icon={<RotateCw size={15} strokeWidth={2} />} onClick={() => retry()}>
          Retry
        </Button>
        {error.digest && <p className="num mt-5 text-caption text-fg-3">ref {error.digest}</p>}
      </section>
    </main>
  );
}
