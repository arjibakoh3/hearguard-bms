"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { printWhenReady, waitForPrintLayout } from "@/lib/print-ready";

export function AutoPrintButton() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void waitForPrintLayout().then(() => {
      if (!cancelled) window.print();
    }).catch((failure: Error) => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, []);

  return <div className="print:hidden"><button type="button" onClick={() => { setError(null); void printWhenReady().catch((failure: Error) => setError(failure.message)); }} className="hg-interactive hg-pressable inline-flex items-center gap-2 bg-[var(--hg-graphite)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hg-graphite-deep)]"><Printer size={17} /> พิมพ์ / Save PDF</button>{error ? <p role="alert" className="mt-2 max-w-sm text-sm text-red-800">{error}</p> : null}</div>;
}
