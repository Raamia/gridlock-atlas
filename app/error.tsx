"use client"; // Error boundaries must be Client Components

import { RotateCw } from "lucide-react";
import { useEffect, type CSSProperties } from "react";
import { Button, LogoMark } from "@/components/ui";

/** Two faint washes in the utility hues (A over B), from the tokens, behind the card. */
const WASH: CSSProperties = {
  background: [
    "radial-gradient(60% 50% at 50% 42%, color-mix(in srgb, var(--util-a) 7%, transparent), transparent 70%)",
    "radial-gradient(40% 40% at 58% 58%, color-mix(in srgb, var(--util-b) 6%, transparent), transparent 70%)",
  ].join(", "),
};

/**
 * Route-level error boundary: one calm sentence and a Retry (`retry()` re-renders the segment). The snapshot is bundled,
 * so nothing is lost. It deliberately avoids the words the engine-failure alert owns ("failed", "could not").
 */
export default function AtlasError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="relative grid h-dvh place-items-center overflow-hidden bg-canvas px-4 pt-(--safe-t) pb-(--safe-b)">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={WASH} />
      <section aria-labelledby="error-title" className="panel relative flex w-full max-w-[400px] flex-col items-center rounded-dialog px-8 py-9 text-center max-sm:px-6">
        <LogoMark size={40} />
        <h1 id="error-title" className="mt-5 text-heading font-semibold text-balance text-fg-1">
          Something went wrong drawing the atlas.
        </h1>
        <p className="mt-2 text-body text-pretty text-fg-2">Your plans and sources are bundled with the app — nothing was lost.</p>
        <Button variant="primary" size="lg" className="mt-6" icon={<RotateCw size={16} strokeWidth={1.75} />} onClick={() => retry()}>
          Retry
        </Button>
        {error.digest && <p className="num mt-5 text-caption text-fg-3">ref {error.digest}</p>}
      </section>
    </main>
  );
}
