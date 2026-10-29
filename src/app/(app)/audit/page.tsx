import Link from "next/link";
import { ArrowRight, History, Search, ShieldCheck, UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { actorRoleLabel, auditActionLabel, auditEntityLabel } from "@/lib/audit-labels";
import { formatDateTime, getSingleQueryValue } from "@/lib/format";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const query = getSingleQueryValue(raw.q);
  const organizationId = getSingleQueryValue(raw.organization);
  const action = getSingleQueryValue(raw.action);
  const entityType = getSingleQueryValue(raw.entity);
  const page = Number(getSingleQueryValue(raw.page) ?? 1);
  const result = await getHearGuardReadService().searchAuditLogs({
    query,
    organizationId,
    action,
    entityType,
    page,
  });

  return (
    <>
      <PageHeader
        eyebrow="Immutable activity history"
        title="Audit log"
        description="ตรวจสอบว่าใครทำอะไร กับข้อมูลใด เมื่อใด ภายใต้ขอบเขตองค์กรที่บัญชีนี้ได้รับอนุญาต"
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <InfoCard icon={History} label="เหตุการณ์ที่มองเห็น" value={result.total.toLocaleString("th-TH")} />
        <InfoCard icon={ShieldCheck} label="Data boundary" value="Organization RLS" />
        <InfoCard icon={UserRound} label="Actor attribution" value="User or System" />
      </div>

      <section className="hg-table-frame overflow-hidden">
        <form method="get" className="border-b border-slate-200 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_1fr_1fr_1fr_auto]">
            <label className="relative">
              <span className="sr-only">ค้นหา audit log</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="search" name="q" defaultValue={query} placeholder="Action, entity หรือ actor" className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
            </label>
            <FilterSelect name="organization" value={organizationId} label="ทุกสถานประกอบการ" options={result.organizations.map((item) => ({ value: item.id, label: item.label }))} />
            <FilterSelect name="action" value={action} label="ทุก action" options={result.actions.map((item) => ({ value: item, label: auditActionLabel(item) }))} />
            <FilterSelect name="entity" value={entityType} label="ทุก entity" options={result.entityTypes.map((item) => ({ value: item, label: auditEntityLabel(item) }))} />
            <button type="submit" className="hg-interactive hg-pressable h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800">กรอง</button>
          </div>
          {query || organizationId || action || entityType ? <div className="mt-3 text-right"><Link href="/audit" className="text-xs font-semibold text-teal-700">ล้างตัวกรองทั้งหมด</Link></div> : null}
        </form>

        {result.items.length === 0 ? (
          <div className="px-5 py-16 text-center"><History aria-hidden="true" className="mx-auto text-slate-300" size={36} /><h2 className="mt-4 font-semibold text-slate-900">ไม่พบ audit event</h2><p className="mt-1 text-sm text-slate-500">ลองเปลี่ยนตัวกรองหรือขอบเขตการค้นหา</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">เวลา</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Entity</th><th className="px-5 py-3">Actor</th><th className="px-5 py-3">องค์กร</th><th className="px-5 py-3"><span className="sr-only">เปิดรายละเอียด</span></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {result.items.map((event) => (
                  <tr key={event.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDateTime(event.createdAt)}</td>
                    <td className="px-5 py-4"><p className="font-semibold text-slate-900">{auditActionLabel(event.action)}</p><p className="mt-1 text-xs text-slate-400">{event.action}</p></td>
                    <td className="px-5 py-4"><p className="font-medium text-slate-700">{auditEntityLabel(event.entityType)}</p><p className="mt-1 font-mono text-[11px] text-slate-400">{event.entityId.slice(0, 8)}…</p></td>
                    <td className="px-5 py-4"><p className="max-w-48 truncate font-medium text-slate-700">{event.actorEmail ?? "System process"}</p><p className="mt-1 text-xs text-slate-500">{actorRoleLabel(event.actorRole)}</p></td>
                    <td className="px-5 py-4 text-slate-600">{event.organizationNameTh ?? event.organizationName ?? "System-wide"}</td>
                    <td className="px-5 py-4 text-right"><Link href={`/audit/${event.id}`} aria-label={`เปิดรายละเอียด ${event.action}`} className="inline-flex rounded-lg p-2 text-teal-700 hover:bg-teal-50"><ArrowRight aria-hidden="true" size={18} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination pathname="/audit" currentQuery={{ q: query, organization: organizationId, action, entity: entityType }} page={result.page} pageSize={result.pageSize} total={result.total} />
      </section>
    </>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof History; label: string; value: string }) {
  return <div className="border-l border-[var(--hg-rule-strong)] pl-4"><div className="flex items-center gap-2"><Icon aria-hidden="true" className="text-[var(--hg-petrol)]" size={16} strokeWidth={1.6} /><p className="hg-technical-label">{label}</p></div><p className="hg-mono mt-2 text-sm font-semibold text-[var(--hg-ink)]">{value}</p></div>;
}

function FilterSelect({ name, value, label, options }: { name: string; value?: string; label: string; options: Array<{ value: string; label: string }> }) {
  return <label><span className="sr-only">{label}</span><select name={name} defaultValue={value ?? ""} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"><option value="">{label}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
