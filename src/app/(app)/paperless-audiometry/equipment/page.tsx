import Link from "next/link";
import { ArrowLeft, AudioWaveform } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getSingleQueryValue } from "@/lib/format";
import { requireHospitalAdmin } from "@/lib/server/current-actor";
import { getHearGuardPaperlessAudiometryService } from "@/lib/server/hearguard-paperless-audiometry-service";
import { upsertHospitalAudiometer } from "../actions";

export default async function AudiometerMasterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireHospitalAdmin();
  const [workspace, raw] = await Promise.all([
    getHearGuardPaperlessAudiometryService().getWorkspace(),
    searchParams,
  ]);
  const error = getSingleQueryValue(raw.error);
  return <>
    <Link href="/paperless-audiometry" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700"><ArrowLeft size={16} /> กลับ Paperless</Link>
    <PageHeader eyebrow="Hospital master data" title="เครื่องตรวจการได้ยิน" description="Paperless จะเลือกเครื่อง active อัตโนมัติเมื่อมีเครื่องเดียว และ resolve รุ่น serial สถานที่กับวันสอบเทียบจาก master ฝั่ง server" />
    {raw.saved === "1" ? <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">บันทึก master เครื่องตรวจแล้ว</p> : null}
    {error ? <p className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">{error}</p> : null}
    <div className="space-y-5">
      {workspace.audiometers.map((item) => <form key={item.id} action={upsertHospitalAudiometer} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><input type="hidden" name="id" value={item.id} /><div className="mb-4 flex items-center gap-2"><AudioWaveform className="text-teal-700" size={19} /><h2 className="font-semibold text-slate-950">{item.displayName}</h2></div><AudiometerFields item={item} /><button className="hg-interactive hg-pressable mt-4 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">บันทึกการแก้ไข</button></form>)}
      <form action={upsertHospitalAudiometer} className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5"><h2 className="font-semibold text-slate-950">เพิ่มเครื่องตรวจ</h2><div className="mt-4"><AudiometerFields /></div><button className="hg-interactive hg-pressable mt-4 rounded-lg border border-teal-300 bg-white px-4 py-2.5 text-sm font-semibold text-teal-800">เพิ่มเครื่อง</button></form>
    </div>
  </>;
}

function AudiometerFields({ item }: { item?: { displayName: string; model: string; serialNumber: string; location: string; calibrationDate: string | null; active: boolean } }) {
  const cls = "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><label className="text-sm font-semibold text-slate-700">ชื่อแสดงผล<input required name="displayName" defaultValue={item?.displayName} className={`${cls} mt-1.5`} /></label><label className="text-sm font-semibold text-slate-700">รุ่น<input required name="model" defaultValue={item?.model} className={`${cls} mt-1.5`} /></label><label className="text-sm font-semibold text-slate-700">Serial<input required name="serialNumber" defaultValue={item?.serialNumber} className={`${cls} mt-1.5`} /></label><label className="text-sm font-semibold text-slate-700">สถานที่<input required name="location" defaultValue={item?.location} className={`${cls} mt-1.5`} /></label><label className="text-sm font-semibold text-slate-700">วันสอบเทียบ<input type="date" name="calibrationDate" defaultValue={item?.calibrationDate ?? ""} className={`${cls} mt-1.5`} /></label><label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" name="active" defaultChecked={item?.active ?? true} /> Active</label></div>;
}
