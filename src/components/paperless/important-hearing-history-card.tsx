import { AlertCircle } from "lucide-react";
import type {
  ImportantHearingCondition,
  ImportantHearingConditionSnapshot,
} from "@/application/paperless-audiometry-models";

type DisplayCondition = ImportantHearingCondition | ImportantHearingConditionSnapshot;

export function importantHearingCategoryLabel(category: DisplayCondition["category"]): string {
  return category === "PRE_EXISTING_HEARING_LOSS"
    ? "สูญเสียการได้ยิน/หูดับเดิม"
    : category === "PRE_EXISTING_HEARING_DISABILITY"
      ? "ความพิการทางการได้ยินเดิม"
      : "ประวัติการได้ยินสำคัญอื่น";
}

function earLabel(value: DisplayCondition["earScope"]): string {
  return value === "LEFT" ? "หูซ้าย" : value === "RIGHT" ? "หูขวา" : value === "BOTH" ? "สองข้าง" : "ไม่ทราบข้าง";
}

function onsetLabel(value: DisplayCondition["onset"]): string {
  return value === "CONGENITAL_OR_CHILDHOOD" ? "ตั้งแต่กำเนิด/วัยเด็ก" : value === "LATER" ? "เกิดภายหลัง" : "ไม่ทราบช่วงเริ่ม";
}

function sourceLabel(value: DisplayCondition["source"]): string {
  return value === "PATIENT_OR_FAMILY" ? "ผู้ป่วย/ญาติแจ้ง" : value === "PRIOR_MEDICAL_RECORD" ? "เวชระเบียนเดิม" : "แพทย์ยืนยัน";
}

export function ImportantHearingHistoryCard({
  conditions,
  legacy = false,
  title = "ประวัติการได้ยินสำคัญ",
  className = "",
}: {
  conditions: DisplayCondition[];
  legacy?: boolean;
  title?: string;
  className?: string;
}) {
  return <section className={`border-l-2 border-[#a56817] bg-[#f7eedb]/58 px-5 py-4 ${className}`}>
    <div className="flex items-start gap-3"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0 text-[#a56817]" size={18} strokeWidth={1.7} /><div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a5715]">ประวัติเดิม · Clinical note</p><h2 className="mt-1 font-semibold text-[#4c3518]">{title}</h2><p className="mt-1 text-sm leading-6 text-[#76551f]">ใช้ประกอบการตรวจเท่านั้น ไม่เปลี่ยนผล Thai/OSHA/NIOSH, baseline หรือ follow-up อัตโนมัติ</p></div></div>
    {legacy ? <p className="mt-4 border-t border-[#d9c28c] pt-3 text-sm text-[#76551f]">ไม่มี snapshot ประวัติสำคัญใน record รุ่นเดิม</p> : conditions.length === 0 ? <p className="mt-4 border-t border-[#d9c28c] pt-3 text-sm text-[#76551f]">ไม่พบประวัติการได้ยินสำคัญที่ active ณ เวลาบันทึก</p> : <div className="mt-4 grid border-t border-[#d9c28c] md:grid-cols-2">{conditions.map((item, index) => <div key={("snapshotId" in item ? item.snapshotId : item.id) ?? `${item.category}:${index}`} className="border-b border-[#e4d6b6] py-3 pr-5 md:odd:border-r md:even:pl-5"><p className="text-sm font-semibold text-[#4c3518]">{importantHearingCategoryLabel(item.category)}</p><p className="mt-1 font-mono text-[10px] leading-5 text-[#8a5715]">{earLabel(item.earScope)} · {onsetLabel(item.onset)} · {sourceLabel(item.source)}</p>{item.details ? <p className="mt-2 text-sm leading-6 text-[#60461e]">{item.details}</p> : null}</div>)}</div>}
  </section>;
}
