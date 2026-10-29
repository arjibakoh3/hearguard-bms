"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileText, X } from "lucide-react";
import type { ProfileAudiogram } from "@/application/view-models";
import { groupAudiogramsByBuddhistYear } from "@/application/audiogram-presentation";
import { formatDateTime } from "@/lib/format";
import { audiogramTypeLabel } from "@/lib/hearing-labels";

export function EmployeeReportLauncher({ employeeId, audiograms }: { employeeId: string; audiograms: ProfileAudiogram[] }) {
  const years = useMemo(() => groupAudiogramsByBuddhistYear(audiograms), [audiograms]);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef({ x: 0, y: 0 });
  const [year, setYear] = useState(years[0]?.year ?? 0);
  const records = years.find((item) => item.year === year)?.records ?? [];
  const [audiogramId, setAudiogramId] = useState(records[0]?.id ?? "");

  useEffect(() => {
    if (!open) return;
    const htmlOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, [open]);

  const closeDialog = () => dialogRef.current?.close();

  const selected = records.find((item) => item.id === audiogramId) ?? records[0];
  const chooseYear = (nextYear: number) => {
    setYear(nextYear);
    setAudiogramId(years.find((item) => item.year === nextYear)?.records[0]?.id ?? "");
  };

  return <>
    <button ref={buttonRef} type="button" disabled={years.length === 0} onClick={() => {
      scrollRef.current = { x: window.scrollX, y: window.scrollY };
      dialogRef.current?.showModal();
      setOpen(true);
    }} className="hg-interactive hg-pressable inline-flex items-center gap-2 bg-[var(--hg-graphite)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--hg-graphite-deep)] disabled:cursor-not-allowed disabled:opacity-40">
      <FileText aria-hidden="true" size={16} /> Report
    </button>
    <dialog ref={dialogRef} className="hg-report-dialog" aria-labelledby="employee-report-title" onClose={() => {
      setOpen(false);
      buttonRef.current?.focus({ preventScroll: true });
      window.scrollTo(scrollRef.current.x, scrollRef.current.y);
    }} onMouseDown={(event) => { if (event.currentTarget === event.target) closeDialog(); }}>
      <div className="hg-dialog-panel w-full max-w-lg border-t-4 border-[var(--hg-petrol)] bg-[var(--hg-surface-raised)] p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><p className="hg-technical-label">Annual audiometry</p><h2 id="employee-report-title" className="mt-1 text-xl font-semibold text-slate-950">เลือกรายงานผลการตรวจ</h2><p className="mt-2 text-sm leading-6 text-slate-500">รายงานจะเปิดในแท็บใหม่และเรียกหน้าต่าง Print สำหรับพิมพ์หรือ Save as PDF</p></div>
          <button type="button" onClick={closeDialog} className="hg-interactive hg-pressable rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /><span className="sr-only">ปิด</span></button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">ปีที่ตรวจ (พ.ศ.)<select value={year} onChange={(event) => chooseYear(Number(event.target.value))} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">{years.map((item) => <option key={item.year} value={item.year}>{item.year}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-700">ผลตรวจ<select value={selected?.id ?? ""} onChange={(event) => setAudiogramId(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">{records.map((item) => <option key={item.id} value={item.id}>{formatDateTime(item.examinedAt)} · {audiogramTypeLabel(item.examType)}</option>)}</select></label>
        </div>
        {selected ? <div className={`mt-4 border-l-2 px-4 py-3 text-sm ${selected.isValid ? "border-[var(--hg-petrol)] bg-[var(--hg-petrol-soft)] text-[var(--hg-petrol-deep)]" : "border-[var(--hg-review)] bg-[var(--hg-review-soft)] text-[#6d4915]"}`}><span className="font-semibold">{audiogramTypeLabel(selected.examType)}</span> · <span className="hg-mono">{formatDateTime(selected.examinedAt)}</span> · {selected.isValid ? "Valid" : "Review required"}</div> : null}
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={closeDialog} className="hg-interactive hg-pressable rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">ยกเลิก</button>{selected ? <Link href={`/employees/${employeeId}/reports/audiograms/${selected.id}`} target="_blank" rel="noopener noreferrer" onClick={closeDialog} className="hg-interactive hg-pressable inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"><FileText size={16} /> เปิดรายงาน</Link> : null}</div>
      </div>
    </dialog>
  </>;
}
