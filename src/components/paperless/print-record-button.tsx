"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import { printWhenReady } from "@/lib/print-ready";

export function PrintRecordButton({ disabled = false }: { disabled?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  return <div className="print:hidden"><button type="button" disabled={disabled} onClick={() => { setError(null); void printWhenReady().catch((failure: Error) => setError(failure.message)); }} className="hg-interactive hg-pressable inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><Printer size={17} /> พิมพ์ record</button>{error ? <p role="alert" className="mt-2 max-w-sm text-sm text-red-800">{error}</p> : null}</div>;
}
