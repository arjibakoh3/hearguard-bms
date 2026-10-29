export default function Loading() {
  return (
    <div aria-busy="true" aria-label="กำลังโหลดข้อมูล" className="hg-loading-motion">
      <div className="h-3 w-36 rounded bg-slate-200" />
      <div className="mt-4 h-9 w-72 max-w-full rounded bg-slate-200" />
      <div className="mt-3 h-4 w-[32rem] max-w-full rounded bg-slate-200" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-28 rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="mt-7 h-96 rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}
