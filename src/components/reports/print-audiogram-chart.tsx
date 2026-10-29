import { buildAudiogramRecordChartData, type AudiogramChartRecord } from "@/application/audiogram-presentation";
import { SUPPORTED_FREQUENCIES_HZ } from "@/domain/hearing";

const RIGHT = "#b63d37";
const LEFT = "#315f9e";
const PLOT = { left: 52, right: 698, top: 12, bottom: 242 };
const xAt = (index: number) => PLOT.left + index * (PLOT.right - PLOT.left) / (SUPPORTED_FREQUENCIES_HZ.length - 1);
const yAt = (value: number) => PLOT.top + (value + 10) * (PLOT.bottom - PLOT.top) / 130;

function segments(values: (number | null)[]) {
  const result: string[] = [];
  let points: string[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (points.length) result.push(points.join(" "));
      points = [];
    } else points.push(`${xAt(index)},${yAt(value)}`);
  });
  if (points.length) result.push(points.join(" "));
  return result;
}

export function PrintAudiogramChart({ current, baseline }: { current: AudiogramChartRecord; baseline: AudiogramChartRecord | null }) {
  const data = buildAudiogramRecordChartData(current, baseline, baseline !== null && baseline.id !== current.id);
  const series = [
    ...(baseline && baseline.id !== current.id ? [{ key: "baseline", left: data.map((p) => p.baselineLeft), right: data.map((p) => p.baselineRight), baseline: true }] : []),
    { key: "current", left: data.map((p) => p.currentLeft), right: data.map((p) => p.currentRight), baseline: false },
  ];
  const hasValues = series.some((item) => [...item.left, ...item.right].some((value) => value !== null));

  return <svg className="hg-print-audiogram" viewBox="0 0 720 280" width="720" height="280" role="img" aria-label="Audiogram: หูขวา O หูซ้าย X, 500 ถึง 8000 Hz, -10 ถึง 120 dB HL">
    <rect width="720" height="280" fill="white" />
    <g fill="#55605c" fontSize="12">
      {Array.from({ length: 14 }, (_, index) => index * 10 - 10).map((db) => <g key={db}>
        <line x1={PLOT.left} x2={PLOT.right} y1={yAt(db)} y2={yAt(db)} stroke="#cfd5d0" strokeDasharray="2 3" />
        <text x={PLOT.left - 8} y={yAt(db) + 4} textAnchor="end">{db}</text>
      </g>)}
      {SUPPORTED_FREQUENCIES_HZ.map((frequency, index) => <g key={frequency}>
        <line x1={xAt(index)} x2={xAt(index)} y1={PLOT.top} y2={PLOT.bottom} stroke="#cfd5d0" strokeDasharray="2 3" />
        <text x={xAt(index)} y="260" textAnchor="middle">{frequency}</text>
      </g>)}
      <text x="375" y="277" textAnchor="middle">Frequency (Hz)</text>
      <text transform="translate(14 127) rotate(-90)" textAnchor="middle">dB HL</text>
    </g>
    <path d={`M ${PLOT.left} ${PLOT.top} V ${PLOT.bottom} H ${PLOT.right}`} fill="none" stroke="#68716e" />
    {series.map((item) => <g key={item.key} opacity={item.baseline ? 0.55 : 1}>
      {([{ values: item.right, color: RIGHT }, { values: item.left, color: LEFT }]).map(({ values, color }) => <g key={color}>
        {segments(values).map((points, index) => <polyline key={index} points={points} fill="none" stroke={color} strokeWidth={item.baseline ? 1.6 : 2} strokeDasharray={item.baseline ? "6 4" : undefined} />)}
      </g>)}
      {/* Paint O before X so equal thresholds retain both ear markers. */}
      {item.right.map((value, index) => value === null ? null : <circle key={index} cx={xAt(index)} cy={yAt(value)} r="4" fill="white" stroke={RIGHT} strokeWidth="1.8" />)}
      {item.left.map((value, index) => value === null ? null : <path key={index} d={`M ${xAt(index) - 3.5} ${yAt(value) - 3.5} l 7 7 m -7 0 l 7 -7`} fill="none" stroke={LEFT} strokeWidth="1.8" />)}
    </g>)}
    {!hasValues ? <text x="375" y="128" textAnchor="middle" fill="#68716e" fontSize="14">ไม่มีค่า threshold แบบ Measured สำหรับแสดงบนกราฟ</text> : null}
  </svg>;
}
