import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Headphones, Plus } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/ui/page-header";
import { getSingleQueryValue } from "@/lib/format";
import { requireCurrentActor } from "@/lib/server/current-actor";
import { getHearGuardHearingProtectionService } from "@/lib/server/hearguard-hearing-protection-service";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";
import { upsertHearingProtector } from "./actions";

const typeLabel = {
  EARMUFF: "Earmuff",
  FOAM_EARPLUG: "Foam earplug",
  OTHER_EARPLUG: "Other earplug",
} as const;

export default async function HearingProtectionCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [organization, actor, protectors, query] = await Promise.all([
    getHearGuardReadService().getOrganization(id),
    requireCurrentActor(),
    getHearGuardHearingProtectionService().listOrganizationProtectors(id),
    searchParams,
  ]);
  if (!organization) notFound();

  return (
    <>
      <Link href={`/companies/${id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700"><ArrowLeft size={16} /> กลับหน้าบริษัท</Link>
      <PageHeader eyebrow={`${organization.code} · PPE catalog`} title="Hearing protector catalog" description="ค่าบนฉลาก NRR และ SNR แยกกันได้ อุปกรณ์ทุกชิ้นถูกจำกัดอยู่ในองค์กรเดียวกัน" />
      {getSingleQueryValue(query.saved) ? <div className="mb-5 border-l-2 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">บันทึก hearing protector แล้ว</div> : null}
      {getSingleQueryValue(query.error) ? <div className="mb-5 border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{getSingleQueryValue(query.error)}</div> : null}

      {actor.canManage ? (
        <section className="mb-7 border-y border-[#bcc4bf] bg-[#fafaf7] p-5">
          <div className="flex items-center gap-2"><Plus size={18} className="text-teal-700" /><h2 className="font-semibold text-slate-950">เพิ่มอุปกรณ์</h2></div>
          <form action={upsertHearingProtector} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="organizationId" value={id} />
            <label className="text-xs font-semibold text-slate-700">ผู้ผลิต<input name="manufacturer" required className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-700">รุ่น<input name="model" required className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-700">ประเภท<select name="protectorType" className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"><option value="EARMUFF">Earmuff</option><option value="FOAM_EARPLUG">Foam earplug</option><option value="OTHER_EARPLUG">Other earplug</option></select></label>
            <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-700">NRR dB<input name="nrrDb" type="number" min="0" max="60" step="0.1" className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-slate-700">SNR dB<input name="snrDb" type="number" min="0" max="60" step="0.1" className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm" /></label></div>
            <label className="text-xs font-semibold text-slate-700 md:col-span-2 xl:col-span-3">หมายเหตุ<input name="notes" className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
            <div className="flex items-end justify-between gap-3"><label className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700"><input name="active" type="checkbox" defaultChecked /> Active</label><button type="submit" className="bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">เพิ่มใน catalog</button></div>
          </form>
        </section>
      ) : <div className="mb-6 border-l-2 border-slate-400 bg-slate-50 px-4 py-3 text-sm text-slate-700">Company users can view this catalog but cannot change it.</div>}

      <section className="space-y-4">
        {protectors.length === 0 ? <p className="border-y border-slate-200 py-6 text-sm text-slate-500">ยังไม่มีอุปกรณ์ใน catalog</p> : protectors.map((protector) => (
          <form key={protector.id} action={upsertHearingProtector} className="border-y border-[#d5dad5] bg-white p-5">
            <input type="hidden" name="id" value={protector.id} /><input type="hidden" name="organizationId" value={id} />
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><Headphones size={20} className="mt-0.5 text-teal-700" /><div><p className="font-semibold text-slate-950">{protector.manufacturer} {protector.model}</p><p className="mt-1 text-xs text-slate-500">{typeLabel[protector.protectorType]} · NRR {protector.nrrDb ?? "—"} · SNR {protector.snrDb ?? "—"}</p></div></div><span className={`text-xs font-semibold ${protector.active ? "text-emerald-700" : "text-slate-400"}`}>{protector.active ? "ACTIVE" : "INACTIVE"}</span></div>
            {actor.canManage ? <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-semibold text-slate-700">ผู้ผลิต<input name="manufacturer" required defaultValue={protector.manufacturer} className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-slate-700">รุ่น<input name="model" required defaultValue={protector.model} className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-slate-700">ประเภท<select name="protectorType" defaultValue={protector.protectorType} className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"><option value="EARMUFF">Earmuff</option><option value="FOAM_EARPLUG">Foam earplug</option><option value="OTHER_EARPLUG">Other earplug</option></select></label><div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-700">NRR<input name="nrrDb" type="number" step="0.1" min="0" max="60" defaultValue={protector.nrrDb ?? ""} className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-slate-700">SNR<input name="snrDb" type="number" step="0.1" min="0" max="60" defaultValue={protector.snrDb ?? ""} className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm" /></label></div><label className="text-xs font-semibold text-slate-700 md:col-span-2 xl:col-span-3">หมายเหตุ<input name="notes" defaultValue={protector.notes ?? ""} className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm" /></label><div className="flex items-end justify-between gap-3"><label className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700"><input name="active" type="checkbox" defaultChecked={protector.active} /> Active</label><button type="submit" className="border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50">บันทึก</button></div></div> : protector.notes ? <p className="mt-3 text-sm text-slate-600">{protector.notes}</p> : null}
          </form>
        ))}
      </section>
    </>
  );
}
