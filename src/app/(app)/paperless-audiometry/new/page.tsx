import { createBlankPaperlessInput } from "@/application/paperless-audiometry-models";
import { PaperlessAudiometryForm } from "@/components/paperless/paperless-audiometry-form";
import { PageHeader } from "@/components/ui/page-header";
import { getSingleQueryValue } from "@/lib/format";
import { requireManagingActor } from "@/lib/server/current-actor";
import { getHearGuardPaperlessAudiometryService } from "@/lib/server/hearguard-paperless-audiometry-service";

export default async function NewPaperlessAudiometryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireManagingActor();
  const [workspace, raw] = await Promise.all([
    getHearGuardPaperlessAudiometryService().getWorkspace(),
    searchParams,
  ]);
  const employeeId = getSingleQueryValue(raw.employee);
  const selectedEmployee = workspace.employees.find((item) => item.id === employeeId);
  const requestedOrganizationId = getSingleQueryValue(raw.organization);
  const organizationId = selectedEmployee?.organizationId
    ?? workspace.organizations.find((item) => item.id === requestedOrganizationId)?.id
    ?? "";
  const initial = createBlankPaperlessInput(
    selectedEmployee?.id ?? "",
    new Date().toISOString(),
    organizationId,
  );
  initial.audiometerId = workspace.audiometers.filter((item) => item.active)[0]?.id ?? null;
  initial.examinerUserId = workspace.examiners.find((item) => item.id === workspace.currentUserId
    && (item.global || !organizationId || item.organizationIds.includes(organizationId)))?.id
    ?? workspace.examiners.find((item) => item.global || !organizationId || item.organizationIds.includes(organizationId))?.id
    ?? null;
  return <>
    <PageHeader eyebrow="Paperless audiometry · New record" title="บันทึกการตรวจการได้ยิน" description="กรอกตามลำดับ 5 ขั้นตอน สามารถ Save Draft แล้วกลับมาบันทึกต่อได้" />
    {getSingleQueryValue(raw.companyCreated) === "1" ? <div className="mb-5 border-l-2 border-[#1d6c67] bg-[#e7f0ed]/60 px-5 py-4 text-sm text-[#15534f]">เพิ่มบริษัทใหม่แล้วและเลือกไว้ให้เรียบร้อย</div> : null}
    <PaperlessAudiometryForm workspace={workspace} initial={initial} draftId={null} canCreateOrganization={actor.role === "HOSPITAL_ADMIN"} />
  </>;
}
