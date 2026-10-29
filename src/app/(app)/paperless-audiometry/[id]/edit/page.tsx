import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { PaperlessAudiometryForm } from "@/components/paperless/paperless-audiometry-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireManagingActor } from "@/lib/server/current-actor";
import { getHearGuardPaperlessAudiometryService } from "@/lib/server/hearguard-paperless-audiometry-service";

export default async function EditPaperlessAudiometryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireManagingActor();
  const [{ id }, raw] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const service = getHearGuardPaperlessAudiometryService();
  const [record, workspace] = await Promise.all([service.getRecord(id), service.getWorkspace()]);
  if (!record) notFound();
  if (record.recordStatus !== "DRAFT") redirect(`/paperless-audiometry/${id}`);
  return <>
    <PageHeader eyebrow={`Draft · HN ${record.hospitalNumber}`} title="บันทึกผลตรวจต่อ" description={`${record.employeeName} · ${record.organizationName}`} />
    {raw.saved === "1" ? <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">บันทึก Draft เรียบร้อยแล้ว</div> : null}
    {raw.correction === "1" ? <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">สร้าง correction draft แล้ว ฉบับ Final เดิมยังคงอยู่จนกว่าฉบับนี้จะ Final</div> : null}
    <PaperlessAudiometryForm workspace={workspace} initial={record} draftId={record.id} canCreateOrganization={actor.role === "HOSPITAL_ADMIN"} />
  </>;
}
