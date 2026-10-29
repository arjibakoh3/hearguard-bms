import Link from "next/link";
import { ArrowLeft, Building2, Clock3, Fingerprint, History, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/ui/page-header";
import { actorRoleLabel, auditActionLabel, auditEntityLabel } from "@/lib/audit-labels";
import { formatDateTime } from "@/lib/format";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";

export default async function AuditLogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const event = await getHearGuardReadService().getAuditLog(id);
  if (!event) notFound();

  return (
    <>
      <Link href="/audit" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700"><ArrowLeft aria-hidden="true" size={16} /> กลับไป Audit log</Link>
      <PageHeader eyebrow={`${event.action} · ${event.id.slice(0, 8)}`} title={auditActionLabel(event.action)} description="Immutable audit event ภายใต้ organization-scoped RLS" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DetailCard icon={Clock3} label="เวลา" value={formatDateTime(event.createdAt)} />
        <DetailCard icon={UserRound} label="Actor" value={event.actorEmail ?? "System process"} detail={actorRoleLabel(event.actorRole)} />
        <DetailCard icon={Building2} label="องค์กร" value={event.organizationNameTh ?? event.organizationName ?? "System-wide"} detail={event.organizationCode ?? undefined} />
        <DetailCard icon={Fingerprint} label="Entity" value={auditEntityLabel(event.entityType)} detail={event.entityId} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <JsonPanel title="ค่าก่อนเปลี่ยน" value={event.oldValues} empty="เหตุการณ์นี้ไม่มี previous state" />
        <JsonPanel title="ค่าหลังเปลี่ยน" value={event.newValues} empty="เหตุการณ์นี้ไม่มี new state" />
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3"><History aria-hidden="true" className="mt-0.5 text-teal-700" size={20} /><div><h2 className="font-semibold text-slate-950">Audit integrity</h2><p className="mt-1 text-sm leading-6 text-slate-500">เหตุการณ์นี้อ่านได้อย่างเดียวจาก UI และไม่เปิดสิทธิ์ update/delete ให้ authenticated users ตัวตน actor ถูกเติมที่ฐานข้อมูลในจังหวะเดียวกับการเขียน event</p></div></div>
      </section>
    </>
  );
}

function DetailCard({ icon: Icon, label, value, detail }: { icon: typeof Clock3; label: string; value: string; detail?: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700"><Icon aria-hidden="true" size={18} /></span><div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</p>{detail ? <p className="mt-1 break-all text-[11px] text-slate-400">{detail}</p> : null}</div></div></div>;
}

function JsonPanel({ title, value, empty }: { title: string; value: Record<string, unknown> | null; empty: string }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">{title}</h2></div>{value ? <pre className="max-h-[32rem] overflow-auto bg-slate-950 p-5 text-xs leading-6 text-slate-200">{JSON.stringify(value, null, 2)}</pre> : <p className="px-5 py-12 text-center text-sm text-slate-500">{empty}</p>}</section>;
}
