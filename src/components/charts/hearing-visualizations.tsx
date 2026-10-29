"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type DotProps,
} from "recharts";
import { Check, ChevronDown, X } from "lucide-react";
import {
  buildAudiogramRecordChartData,
  getAudiogramComparisonSelection,
  getHearingTrajectorySequence,
  toggleOptionalAudiogram,
} from "@/application/audiogram-presentation";
import type { AudiogramChartRecord } from "@/application/audiogram-presentation";
import type { ProfileAudiogram } from "@/application/view-models";
import type { Ear, FrequencyHz } from "@/domain/hearing";
import { formatDateTime } from "@/lib/format";
import { audiogramTypeLabel } from "@/lib/hearing-labels";

const FREQUENCIES = [
  500, 1000, 2000, 3000, 4000, 6000, 8000,
] as const satisfies readonly FrequencyHz[];
const DB_TICKS = [-10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
const RIGHT_EAR_STROKE = "#b63d37";
const LEFT_EAR_STROKE = "#315f9e";

type EarSelection = Ear | "BOTH";

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function buddhistYear(value: string): string {
  return String(Number(value.slice(0, 4)) + 543);
}

function thresholdAt(
  audiogram: ProfileAudiogram | undefined,
  ear: Ear,
  frequencyHz: FrequencyHz,
): number | null {
  return (
    audiogram?.thresholds.find(
      (point) => point.ear === ear && point.frequencyHz === frequencyHz,
    )?.thresholdDbHl ?? null
  );
}

function ChartShell({ children }: { children: React.ReactNode }) {
  return <div className="h-[410px] w-full min-w-0">{children}</div>;
}

type ComparisonSeries = {
  key: string;
  label: string;
  item: ProfileAudiogram;
  dash?: string;
  strokeWidth: number;
  opacity: number;
};

const OPTIONAL_DASHES = ["3 3", "10 4 2 4", "1 4"];

function hasOverlappingEarThreshold(item: ProfileAudiogram): boolean {
  return FREQUENCIES.some((frequencyHz) => {
    const left = thresholdAt(item, "LEFT", frequencyHz);
    const right = thresholdAt(item, "RIGHT", frequencyHz);
    return left !== null && right !== null && left === right;
  });
}

function RightEarDot({ cx = 0, cy = 0, stroke = RIGHT_EAR_STROKE, strokeOpacity = 1 }: DotProps) {
  return <circle cx={cx} cy={cy} r={4} fill="white" stroke={stroke} strokeWidth={2} opacity={strokeOpacity} />;
}

function LeftEarDot({ cx = 0, cy = 0, stroke = LEFT_EAR_STROKE, strokeOpacity = 1 }: DotProps) {
  return <g opacity={strokeOpacity}><line x1={cx - 3.5} x2={cx + 3.5} y1={cy - 3.5} y2={cy + 3.5} stroke={stroke} strokeWidth={2} /><line x1={cx - 3.5} x2={cx + 3.5} y1={cy + 3.5} y2={cy - 3.5} stroke={stroke} strokeWidth={2} /></g>;
}

function EarLegendItems() {
  return <>
    <span className="inline-flex items-center gap-2"><svg aria-hidden="true" width="22" height="10" viewBox="0 0 22 10"><line x1="0" x2="22" y1="5" y2="5" stroke={RIGHT_EAR_STROKE} strokeWidth="2" /><circle cx="11" cy="5" r="3.25" fill="white" stroke={RIGHT_EAR_STROKE} strokeWidth="2" /></svg>ขวา O</span>
    <span className="inline-flex items-center gap-2"><svg aria-hidden="true" width="22" height="10" viewBox="0 0 22 10"><line x1="0" x2="22" y1="5" y2="5" stroke={LEFT_EAR_STROKE} strokeWidth="2" /><line x1="8" x2="14" y1="2" y2="8" stroke={LEFT_EAR_STROKE} strokeWidth="2" /><line x1="8" x2="14" y1="8" y2="2" stroke={LEFT_EAR_STROKE} strokeWidth="2" /></svg>ซ้าย X</span>
  </>;
}

type EarLineProps = {
  dataKey: string;
  ear: Ear;
  label: string;
  strokeDasharray?: string;
  strokeOpacity: number;
  strokeWidth: number;
  type?: "linear" | "monotone";
};

function EarLine({
  dataKey,
  ear,
  label,
  strokeDasharray,
  strokeOpacity,
  strokeWidth,
  type = "linear",
}: EarLineProps) {
  const right = ear === "RIGHT";
  const earLabel = right ? "ขวา O" : "ซ้าย X";
  return <Line
    type={type}
    dataKey={dataKey}
    name={label ? `${label} · ${earLabel}` : `หู${earLabel}`}
    stroke={right ? RIGHT_EAR_STROKE : LEFT_EAR_STROKE}
    strokeWidth={strokeWidth}
    strokeDasharray={strokeDasharray}
    strokeOpacity={strokeOpacity}
    dot={right ? <RightEarDot /> : <LeftEarDot />}
    activeDot={false}
    connectNulls={false}
    isAnimationActive={false}
  />;
}

type EarPairLinesProps = Omit<EarLineProps, "dataKey" | "ear"> & {
  leftDataKey: string;
  rightDataKey: string;
};

function EarPairLines({
  label,
  leftDataKey,
  rightDataKey,
  strokeDasharray,
  strokeOpacity,
  strokeWidth,
  type = "linear",
}: EarPairLinesProps) {
  const leftLabel = label ? `${label} · ซ้าย X` : "หูซ้าย X";
  const rightLabel = label ? `${label} · ขวา O` : "หูขวา O";
  return <>
    <Line
      type={type}
      dataKey={leftDataKey}
      name={leftLabel}
      stroke={LEFT_EAR_STROKE}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
      strokeOpacity={strokeOpacity}
      dot={false}
      activeDot={false}
      connectNulls={false}
      isAnimationActive={false}
    />
    <Line
      type={type}
      dataKey={rightDataKey}
      name={rightLabel}
      stroke={RIGHT_EAR_STROKE}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
      strokeOpacity={strokeOpacity}
      dot={<RightEarDot />}
      activeDot={false}
      connectNulls={false}
      isAnimationActive={false}
    />
    <Line
      type={type}
      dataKey={leftDataKey}
      stroke="transparent"
      strokeWidth={0}
      strokeOpacity={0}
      dot={({ cx, cy }) => <LeftEarDot cx={cx} cy={cy} stroke={LEFT_EAR_STROKE} strokeOpacity={strokeOpacity} />}
      activeDot={false}
      tooltipType="none"
      legendType="none"
      connectNulls={false}
      isAnimationActive={false}
    />
  </>;
}

function buildComparisonSeries(
  baseline: ProfileAudiogram | null,
  latest: ProfileAudiogram | null,
  optional: ProfileAudiogram[],
): ComparisonSeries[] {
  if (!latest) return [];
  if (baseline?.id === latest.id) {
    return [{ key: "baselineLatest", label: "Baseline / Latest", item: latest, dash: "8 5", strokeWidth: 2.6, opacity: 1 }];
  }
  return [
    ...(baseline ? [{ key: "baseline", label: "Active baseline", item: baseline, dash: "8 5", strokeWidth: 2, opacity: 0.9 }] : []),
    ...optional.map((item, index) => ({
      key: `optional${index}`,
      label: "ผลเปรียบเทียบ",
      item,
      dash: OPTIONAL_DASHES[index],
      strokeWidth: 1.7,
      opacity: 0.65,
    })),
    { key: "latest", label: "Latest", item: latest, strokeWidth: 2.8, opacity: 1 },
  ];
}

function SeriesLegend({ series, showOverlapNote = false }: { series: ComparisonSeries[]; showOverlapNote?: boolean }) {
  const overlappingLabels = showOverlapNote
    ? series.filter(({ item }) => hasOverlappingEarThreshold(item)).map(({ label }) => label)
    : [];

  return <div className="mb-4 grid border-y border-[var(--hg-rule)] py-3 lg:grid-cols-[0.65fr_1.35fr]">
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--hg-muted)] lg:border-r lg:border-[var(--hg-rule)] lg:pr-4">
      <span className="hg-technical-label">Ear markers</span>
      <EarLegendItems />
    </div>
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--hg-muted)] lg:mt-0 lg:pl-4">
      {series.map((item) => <span key={item.key} className="inline-flex items-center gap-2">
        <svg aria-hidden="true" width="28" height="6" viewBox="0 0 28 6"><line x1="0" x2="28" y1="3" y2="3" stroke="#475569" strokeWidth={item.strokeWidth} strokeDasharray={item.dash} opacity={item.opacity} /></svg>
        <span><strong className="font-semibold text-[var(--hg-ink)]">{item.label}</strong> · <span className="hg-mono">{shortDate(item.item.examDate)}</span></span>
      </span>)}
    </div>
    {overlappingLabels.length > 0 ? <p className="col-span-full mt-2 text-[11px] leading-5 text-[var(--hg-muted)]"><strong className="font-semibold text-[var(--hg-ink-soft)]">จุดซ้อนกัน:</strong> {overlappingLabels.join(" / ")} มีค่า threshold หูซ้ายและขวาเท่ากันอย่างน้อยหนึ่งความถี่ จึงแสดง O แดงและ X น้ำเงินซ้อนกัน ณ พิกัดเดียวกัน</p> : null}
  </div>;
}

export function AudiogramComparisonChart({
  audiograms,
}: {
  audiograms: ProfileAudiogram[];
}) {
  const [ear, setEar] = useState<EarSelection>("BOTH");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selection = useMemo(() => getAudiogramComparisonSelection(audiograms), [audiograms]);
  const optional = selection.candidates.filter((item) => selectedIds.includes(item.id));
  const comparisons = buildComparisonSeries(selection.baseline, selection.latest, optional);
  const ears: Ear[] = ear === "BOTH" ? ["RIGHT", "LEFT"] : [ear];
  const data = FREQUENCIES.map((frequencyHz) => {
    const point: Record<string, number | string | null> = { frequencyHz };
    for (const series of comparisons) {
      for (const selectedEar of ears) {
        point[`${series.key}${selectedEar}`] = thresholdAt(
          series.item,
          selectedEar,
          frequencyHz,
        );
      }
    }
    return point;
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex border-b border-[var(--hg-rule-strong)]" aria-label="เลือกหู">
          {(["BOTH", "RIGHT", "LEFT"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setEar(value)}
              aria-pressed={ear === value}
              className={`hg-interactive hg-pressable border-b-2 px-3 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-[var(--hg-petrol)] ${
                ear === value
                  ? "border-[var(--hg-petrol)] text-[var(--hg-ink)]"
                  : "border-transparent text-[var(--hg-muted)] hover:text-[var(--hg-ink)]"
              }`}
            >
              {value === "BOTH" ? "สองข้าง" : value === "RIGHT" ? "หูขวา" : "หูซ้าย"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selection.candidates.length > 0 ? <details className="group relative">
            <summary className="hg-interactive hg-pressable flex cursor-pointer list-none items-center gap-2 border border-[var(--hg-rule-strong)] bg-[var(--hg-surface)] px-3 py-2 text-xs font-semibold text-[var(--hg-ink-soft)] hover:border-[var(--hg-petrol)] hover:text-[var(--hg-petrol)]">
              เพิ่มผลตรวจเปรียบเทียบ <span className="hg-mono text-[10px] text-[var(--hg-muted)]">{selectedIds.length}/3</span><ChevronDown size={14} className="hg-disclosure-icon group-open:rotate-180" />
            </summary>
            <div className="hg-fade-enter absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] border border-[var(--hg-rule-strong)] bg-[var(--hg-surface-raised)] p-2 shadow-xl">
              <p className="px-2 py-1.5 text-xs leading-5 text-slate-500">เลือก Final/valid records เพิ่มได้สูงสุด 3 รายการ</p>
              <div className="max-h-64 overflow-y-auto">
                {selection.candidates.map((item) => {
                  const checked = selectedIds.includes(item.id);
                  const disabled = !checked && selectedIds.length >= 3;
                  return <label key={item.id} className={`hg-interactive flex items-start gap-3 rounded-lg px-2 py-2.5 ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-slate-50"}`}>
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => setSelectedIds((current) => toggleOptionalAudiogram(current, item.id))} className="sr-only" />
                    <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${checked ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white"}`}>{checked ? <Check size={12} /> : null}</span>
                    <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">{shortDate(item.examDate)}</span><span className="mt-0.5 block text-xs text-slate-500">{item.examType.replaceAll("_", " ")} · {item.clinicalResult?.replace("_", " ") ?? "No evaluation"}</span></span>
                  </label>;
                })}
              </div>
            </div>
          </details> : null}
          <p className="text-xs text-slate-500">dB HL ค่าน้อยอยู่ด้านบน</p>
        </div>
      </div>

      {optional.length > 0 ? <div className="mb-3 flex flex-wrap gap-2">{optional.map((item) => <button key={item.id} type="button" onClick={() => setSelectedIds((current) => current.filter((id) => id !== item.id))} className="hg-interactive hg-pressable inline-flex items-center gap-1.5 border-b border-[var(--hg-info)] px-1 py-1 text-xs font-semibold text-[var(--hg-info)] hover:bg-[var(--hg-info-soft)]">{shortDate(item.examDate)}<X size={13} /><span className="sr-only">นำออกจากกราฟ</span></button>)}</div> : null}
      {!selection.baseline && selection.latest ? <p className="mb-4 border-l-2 border-[var(--hg-review)] bg-[var(--hg-review-soft)] px-3.5 py-3 text-sm text-[#6d4915]">ยังไม่มี Active baseline กราฟจึงแสดง Latest และผลที่เลือกโดยไม่มีเส้นอ้างอิง baseline</p> : null}
      <SeriesLegend series={comparisons} showOverlapNote={ear === "BOTH"} />

      {comparisons.length === 0 ? <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">ยังไม่มี Final audiogram ที่ valid สำหรับเปรียบเทียบ</div> : <ChartShell>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 22, left: 0 }}>
            <CartesianGrid stroke="#cfd5d0" strokeDasharray="2 3" />
            <XAxis
              dataKey="frequencyHz"
              type="category"
              ticks={[...FREQUENCIES]}
              label={{ value: "Frequency (Hz)", position: "insideBottom", offset: -14 }}
              tick={{ fill: "#68716e", fontSize: 11, fontFamily: "var(--font-hg-mono)" }}
            />
            <YAxis
              reversed
              domain={[-10, 120]}
              ticks={DB_TICKS}
              width={48}
              label={{ value: "dB HL", angle: -90, position: "insideLeft" }}
              tick={{ fill: "#68716e", fontSize: 11, fontFamily: "var(--font-hg-mono)" }}
            />
            <Tooltip
              formatter={(value, name) => [`${String(value)} dB HL`, String(name)]}
              labelFormatter={(frequency) => `${String(frequency)} Hz`}
              contentStyle={{ borderRadius: 10, borderColor: "#cbd5e1", fontSize: 12 }}
            />
            {comparisons.map((series) => ear === "BOTH"
              ? <EarPairLines
                  key={series.key}
                  leftDataKey={`${series.key}LEFT`}
                  rightDataKey={`${series.key}RIGHT`}
                  label={`${series.label} · ${shortDate(series.item.examDate)}`}
                  strokeWidth={series.strokeWidth}
                  strokeDasharray={series.dash}
                  strokeOpacity={series.opacity}
                />
              : <EarLine
                  key={`${series.key}${ear}`}
                  dataKey={`${series.key}${ear}`}
                  ear={ear}
                  label={`${series.label} · ${shortDate(series.item.examDate)}`}
                  strokeWidth={series.strokeWidth}
                  strokeDasharray={series.dash}
                  strokeOpacity={series.opacity}
                />)}
          </LineChart>
        </ResponsiveContainer>
      </ChartShell>}
    </div>
  );
}

export function AudiogramReportChart({ baseline, current }: { baseline: ProfileAudiogram | null; current: ProfileAudiogram }) {
  const comparisons = buildComparisonSeries(baseline, current, []).map((series) => ({
    ...series,
    label: series.key === "baseline" ? "Baseline อ้างอิง"
      : series.key === "latest" ? "ผลตรวจที่เลือก" : "Baseline / ผลตรวจที่เลือก",
  }));
  const data = FREQUENCIES.map((frequencyHz) => {
    const point: Record<string, number | string | null> = { frequencyHz };
    for (const series of comparisons) {
      for (const selectedEar of ["LEFT", "RIGHT"] as const) {
        point[`${series.key}${selectedEar}`] = thresholdAt(series.item, selectedEar, frequencyHz);
      }
    }
    return point;
  });
  return <div>
    <SeriesLegend series={comparisons} showOverlapNote />
    <ChartShell><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 16, bottom: 22, left: 0 }}>
      <CartesianGrid stroke="#cbd5e1" strokeDasharray="3 3" />
      <XAxis dataKey="frequencyHz" type="category" ticks={[...FREQUENCIES]} label={{ value: "Frequency (Hz)", position: "insideBottom", offset: -14 }} tick={{ fill: "#475569", fontSize: 12 }} />
      <YAxis reversed domain={[-10, 120]} ticks={DB_TICKS} width={48} label={{ value: "dB HL", angle: -90, position: "insideLeft" }} tick={{ fill: "#475569", fontSize: 12 }} />
      <Tooltip formatter={(value, name) => [`${String(value)} dB HL`, String(name)]} labelFormatter={(frequency) => `${String(frequency)} Hz`} />
      {comparisons.map((series) => <EarPairLines
        key={series.key}
        leftDataKey={`${series.key}LEFT`}
        rightDataKey={`${series.key}RIGHT`}
        label={series.label}
        strokeWidth={series.strokeWidth}
        strokeDasharray={series.dash}
        strokeOpacity={series.opacity}
      />)}
    </LineChart></ResponsiveContainer></ChartShell>
  </div>;
}

type RecordChartMode = "CURRENT" | "COMPARE";

export function ElectronicAudiogramChart({
  current,
  baseline,
}: {
  current: AudiogramChartRecord;
  baseline: AudiogramChartRecord | null;
}) {
  const [mode, setMode] = useState<RecordChartMode>("CURRENT");
  const baselineAvailable = baseline !== null && baseline.id !== current.id;
  const comparing = mode === "COMPARE" && baselineAvailable;
  const data = useMemo(
    () => buildAudiogramRecordChartData(current, baseline, comparing),
    [baseline, comparing, current],
  );
  const series = [
    ...(comparing && baseline
      ? [{
          key: "baseline" as const,
          label: "Baseline snapshot",
          examDate: baseline.examDate,
          dash: "8 5",
          opacity: 0.72,
          strokeWidth: 2,
        }]
      : []),
    {
      key: "current" as const,
      label: "ผลครั้งนี้",
      examDate: current.examDate,
      dash: undefined,
      opacity: 1,
      strokeWidth: 2.8,
    },
  ];
  const hasPlottableValue = data.some((row) =>
    series.some((item) =>
      (["Left", "Right"] as const).some(
        (ear) => row[`${item.key}${ear}`] !== null,
      ),
    ),
  );
  const overlappingLabels = series
    .filter((item) => data.some((row) => {
      const left = row[`${item.key}Left`];
      const right = row[`${item.key}Right`];
      return left !== null && right !== null && left === right;
    }))
    .map((item) => item.label);

  return <div>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="print:hidden">
        <p className="hg-technical-label mb-2">มุมมองกราฟ</p>
        <div className="inline-flex border-b border-[var(--hg-rule-strong)]" aria-label="เลือกมุมมองกราฟ audiogram">
          <button
            type="button"
            onClick={() => setMode("CURRENT")}
            aria-pressed={mode === "CURRENT"}
            className={`hg-interactive hg-pressable border-b-2 px-3 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-[var(--hg-petrol)] ${mode === "CURRENT" ? "border-[var(--hg-petrol)] text-[var(--hg-ink)]" : "border-transparent text-[var(--hg-muted)] hover:text-[var(--hg-ink)]"}`}
          >
            ผลครั้งนี้
          </button>
          <button
            type="button"
            disabled={!baselineAvailable}
            onClick={() => setMode("COMPARE")}
            aria-pressed={mode === "COMPARE"}
            className={`hg-interactive hg-pressable border-b-2 px-3 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-[var(--hg-petrol)] ${mode === "COMPARE" ? "border-[var(--hg-petrol)] text-[var(--hg-ink)]" : "border-transparent text-[var(--hg-muted)] hover:text-[var(--hg-ink)]"} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            เทียบ baseline
          </button>
        </div>
      </div>
      <p className="text-xs leading-5 text-[var(--hg-muted)]">dB HL ค่าน้อยอยู่ด้านบน<br />NR และ Not tested ไม่ถูกแทนด้วย 0</p>
    </div>

    {!baselineAvailable ? <p className="mb-4 border-l-2 border-[var(--hg-review)] bg-[var(--hg-review-soft)] px-3.5 py-3 text-sm text-[#6d4915] print:hidden">ไม่มี persisted baseline snapshot สำหรับ record นี้ จึงแสดงได้เฉพาะผลครั้งนี้</p> : null}

    <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 border-y border-[var(--hg-rule)] py-3 text-xs text-[var(--hg-muted)]">
      <span className="hg-technical-label">Series</span>
      {series.map((item) => <span key={item.key} className="inline-flex items-center gap-2">
        <svg aria-hidden="true" width="28" height="6" viewBox="0 0 28 6"><line x1="0" x2="28" y1="3" y2="3" stroke="#475569" strokeWidth={item.strokeWidth} strokeDasharray={item.dash} opacity={item.opacity} /></svg>
        <span><strong className="font-semibold text-[var(--hg-ink)]">{item.label}</strong> · <span className="hg-mono">{shortDate(item.examDate)}</span></span>
      </span>)}
      <EarLegendItems />
      {overlappingLabels.length > 0 ? <p className="basis-full text-[11px] leading-5 text-[var(--hg-muted)]"><strong className="font-semibold text-[var(--hg-ink-soft)]">จุดซ้อนกัน:</strong> {overlappingLabels.join(" / ")} มีค่า threshold หูซ้ายและขวาเท่ากันอย่างน้อยหนึ่งความถี่ จึงแสดง O แดงและ X น้ำเงินซ้อนกัน ณ พิกัดเดียวกัน</p> : null}
    </div>

    {!hasPlottableValue ? <div className="flex h-[360px] items-center justify-center border border-dashed border-[var(--hg-rule-strong)] bg-[var(--hg-surface-muted)] px-5 text-center text-sm text-[var(--hg-muted)] print:h-[320px]">ยังไม่มีค่า threshold แบบ Measured สำหรับแสดงบนกราฟ</div> : <div className="h-[410px] w-full min-w-0 print:h-[340px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 22, left: 0 }}>
          <CartesianGrid stroke="#cfd5d0" strokeDasharray="2 3" />
          <XAxis
            dataKey="frequencyHz"
            type="category"
            ticks={[...FREQUENCIES]}
            label={{ value: "Frequency (Hz)", position: "insideBottom", offset: -14 }}
            tick={{ fill: "#68716e", fontSize: 11, fontFamily: "var(--font-hg-mono)" }}
          />
          <YAxis
            reversed
            domain={[-10, 120]}
            ticks={DB_TICKS}
            width={48}
            label={{ value: "dB HL", angle: -90, position: "insideLeft" }}
            tick={{ fill: "#68716e", fontSize: 11, fontFamily: "var(--font-hg-mono)" }}
          />
          <Tooltip
            formatter={(value, name) => [`${String(value)} dB HL`, String(name)]}
            labelFormatter={(frequency) => `${String(frequency)} Hz`}
            contentStyle={{ borderRadius: 0, borderColor: "#cbd5e1", fontSize: 12 }}
          />
          {series.map((item) => <EarPairLines
            key={item.key}
            leftDataKey={`${item.key}Left`}
            rightDataKey={`${item.key}Right`}
            label={item.label}
            strokeWidth={item.strokeWidth}
            strokeDasharray={item.dash}
            strokeOpacity={item.opacity}
          />)}
        </LineChart>
      </ResponsiveContainer>
    </div>}
  </div>;
}

export function HearingTrajectoryChart({
  audiograms,
}: {
  audiograms: ProfileAudiogram[];
}) {
  const [frequencyHz, setFrequencyHz] = useState<FrequencyHz>(4000);
  const trajectoryAudiograms = useMemo(
    () => getHearingTrajectorySequence(audiograms),
    [audiograms],
  );
  const useYearTicks = trajectoryAudiograms.length > 6;
  const data = trajectoryAudiograms
    .map((audiogram) => ({
      axisKey: audiogram.id,
      examDate: audiogram.examDate,
      examinedAt: audiogram.examinedAt,
      tickLabel: useYearTicks
        ? buddhistYear(audiogram.examDate)
        : shortDate(audiogram.examDate),
      left: thresholdAt(audiogram, "LEFT", frequencyHz),
      right: thresholdAt(audiogram, "RIGHT", frequencyHz),
      examType: audiogram.examType,
    }));
  const tickLabels = new Map(data.map((row) => [row.axisKey, row.tickLabel]));
  const hasOverlappingPoint = data.some((row) =>
    row.left !== null && row.right !== null && row.left === row.right,
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          ความถี่
          <select
            value={frequencyHz}
            onChange={(event) => setFrequencyHz(Number(event.target.value) as FrequencyHz)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          >
            {FREQUENCIES.map((value) => (
              <option key={value} value={value}>{value} Hz</option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500"><EarLegendItems /></div>
      </div>

      {hasOverlappingPoint ? <p className="mb-3 text-[11px] leading-5 text-[var(--hg-muted)]"><strong className="font-semibold text-[var(--hg-ink-soft)]">จุดซ้อนกัน:</strong> ค่า threshold หูซ้ายและขวาเท่ากันอย่างน้อยหนึ่งครั้งตรวจ จึงแสดง O แดงและ X น้ำเงินซ้อนกัน ณ พิกัดเดียวกัน</p> : null}

      <ChartShell>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 22, left: 0 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
            <XAxis
              dataKey="axisKey"
              type="category"
              interval="preserveStartEnd"
              minTickGap={useYearTicks ? 40 : 24}
              tickFormatter={(value) => tickLabels.get(String(value)) ?? ""}
              label={{
                value: useYearTicks ? "ปีตรวจ (พ.ศ.)" : "วันที่ตรวจ",
                position: "insideBottom",
                offset: -14,
              }}
              tick={{
                fill: "#64748b",
                fontSize: 11,
                fontFamily: "var(--font-hg-mono)",
              }}
            />
            <YAxis
              reversed
              domain={[-10, 120]}
              ticks={DB_TICKS}
              width={48}
              label={{ value: "dB HL", angle: -90, position: "insideLeft" }}
              tick={{ fill: "#64748b", fontSize: 12 }}
            />
            <Tooltip
              formatter={(value, name) => [`${String(value)} dB HL`, String(name)]}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as typeof data[number] | undefined;
                return row
                  ? `${formatDateTime(row.examinedAt)} · ${audiogramTypeLabel(row.examType)} · ${frequencyHz} Hz`
                  : "";
              }}
              contentStyle={{ borderRadius: 10, borderColor: "#cbd5e1", fontSize: 12 }}
            />
            <EarPairLines
              leftDataKey="left"
              rightDataKey="right"
              label=""
              strokeWidth={2.5}
              strokeOpacity={1}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartShell>
    </div>
  );
}
