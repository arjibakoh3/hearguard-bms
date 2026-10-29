"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import type { NihlPhysicianReview, NihlReviewAmendmentState } from "@/application/nihl-evidence-models";
import { NIHL_PHYSICIAN_DECISION_LABELS, nihlPhysicianDecisionLabel } from "@/application/report-presentation";
import { formatDateTime } from "@/lib/format";

type AmendmentAction = (state: NihlReviewAmendmentState, data: FormData) => Promise<NihlReviewAmendmentState>;

function ReviewEditor({ review, employeeId, audiogramId, action, cancel, saved }: {
  review: NihlPhysicianReview; employeeId: string; audiogramId: string;
  action: AmendmentAction; cancel: () => void; saved: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null, conflict: false });
  const [decision, setDecision] = useState(review.decision);
  const [note, setNote] = useState(review.reviewNote);
  useEffect(() => { if (state.saved) saved(); }, [state.saved, saved]);
  return <form action={formAction} className="mt-4 space-y-4" aria-label="แก้ไขความเห็นแพทย์ NIHL">
    <input type="hidden" name="reviewId" value={review.id} />
    <input type="hidden" name="employeeId" value={employeeId} />
    <input type="hidden" name="expectedRevision" value={review.revision} />
    <label className="block text-sm font-semibold">ข้อสรุปของแพทย์<select name="decision" value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)} disabled={pending} className="mt-2 block w-full border border-[#b8c0bc] bg-white px-3 py-2.5 text-sm">{Object.entries(NIHL_PHYSICIAN_DECISION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="block text-sm font-semibold">เหตุผลของแพทย์<textarea required name="reviewNote" value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} rows={6} readOnly={pending} className="mt-2 block w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm font-normal leading-6" /></label>
    {state.error ? <div role="alert" className="border-l-2 border-[#a83232] bg-[#f8eaea] px-4 py-3 text-sm text-[#a83232]">{state.error}{state.conflict ? <a className="ml-2 underline" href={`/employees/${employeeId}/nihl-evidence?audiogram=${audiogramId}#physician-review`}>โหลดรีวิวล่าสุด</a> : null}</div> : null}
    <div className="flex gap-3"><button type="submit" disabled={pending || state.conflict} className="hg-interactive hg-pressable bg-[#1d2926] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</button><button type="button" onClick={cancel} disabled={pending} className="hg-interactive border border-[#b8c0bc] px-4 py-2.5 text-sm">ยกเลิก</button></div>
  </form>;
}

export function NihlPhysicianReviewPanel({ review, employeeId, audiogramId, canEdit, action }: {
  review: NihlPhysicianReview; employeeId: string; audiogramId: string; canEdit: boolean; action: AmendmentAction;
}) {
  // A server action can refresh the surrounding RSC tree even on failure.
  // Freeze the version being edited so refreshed props cannot erase the draft.
  const [editingReview, setEditingReview] = useState<NihlPhysicianReview | null>(null);
  const [didSave, setDidSave] = useState(false);
  const saved = useCallback(() => { setEditingReview(null); setDidSave(true); }, []);
  return <div className="mt-5 border-l-2 border-[#1d6c67] bg-[#eef3f0] px-5 py-4">
    <p className="font-semibold">{nihlPhysicianDecisionLabel(review.decision)}</p>
    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{review.reviewNote}</p>
    <p className="mt-2 text-xs text-[#68716e]">ลงความเห็นเมื่อ {formatDateTime(review.reviewedAt)}</p>
    {review.amendedAt ? <p className="mt-1 text-xs text-[#68716e]">แก้ไขล่าสุด {formatDateTime(review.amendedAt)} · ฉบับที่ {review.revision}</p> : null}
    {didSave && !editingReview ? <p role="status" className="mt-3 text-sm text-[#175d58]">บันทึกการแก้ไขแล้ว</p> : null}
    {canEdit && !editingReview ? <button type="button" onClick={() => { setEditingReview(review); setDidSave(false); }} className="hg-interactive mt-4 border border-[#1d6c67] bg-white px-3 py-2 text-sm font-semibold text-[#175d58]">แก้ไขความเห็น</button> : null}
    {canEdit && editingReview ? <ReviewEditor review={editingReview} employeeId={employeeId} audiogramId={audiogramId} action={action} cancel={() => setEditingReview(null)} saved={saved} /> : null}
    {review.revisions.length > 1 ? <details className="mt-4 border-t border-[#bcc4bf] pt-3"><summary className="cursor-pointer text-sm font-semibold">ประวัติการแก้ไข ({review.revisions.length} ฉบับ)</summary><ol className="mt-3 space-y-4">{review.revisions.map((item) => <li key={item.revision} className="border-l-2 border-[#9da7a1] pl-3"><p className="text-xs text-[#68716e]">ฉบับที่ {item.revision} · {formatDateTime(item.recordedAt)}{item.revision === review.revision ? " · ปัจจุบัน" : ""}</p><p className="mt-1 text-sm font-semibold">{nihlPhysicianDecisionLabel(item.decision)}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.reviewNote}</p></li>)}</ol></details> : null}
  </div>;
}
