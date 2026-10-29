import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

function pageHref(
  pathname: string,
  currentQuery: Record<string, string | undefined>,
  page: number,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(currentQuery)) {
    if (value) search.set(key, value);
  }

  search.set("page", String(page));
  return `${pathname}?${search.toString()}`;
}

export function Pagination({
  pathname,
  currentQuery,
  page,
  pageSize,
  total,
}: {
  pathname: string;
  currentQuery: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t border-[#bcc4bf] px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="font-mono text-[11px] text-[#68716e]">
        แสดง {start}–{end} จาก {total.toLocaleString("th-TH")} รายการ
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={pageHref(pathname, currentQuery, page - 1)}
            className="hg-interactive hg-pressable inline-flex items-center gap-1 border border-[#bcc4bf] bg-[#fafaf7] px-3 py-2 font-medium text-[#46504d] hover:bg-white focus-visible:outline-2 focus-visible:outline-[#1d6c67]"
          >
            <ChevronLeft aria-hidden="true" size={16} /> ก่อนหน้า
          </Link>
        ) : (
          <span className="inline-flex cursor-not-allowed items-center gap-1 border border-[#d5dad5] px-3 py-2 text-[#9da5a2]">
            <ChevronLeft aria-hidden="true" size={16} /> ก่อนหน้า
          </span>
        )}
        <span className="px-2 font-mono text-[11px] text-[#68716e]">
          หน้า {Math.min(page, pageCount)} / {pageCount}
        </span>
        {page < pageCount ? (
          <Link
            href={pageHref(pathname, currentQuery, page + 1)}
            className="hg-interactive hg-pressable inline-flex items-center gap-1 border border-[#bcc4bf] bg-[#fafaf7] px-3 py-2 font-medium text-[#46504d] hover:bg-white focus-visible:outline-2 focus-visible:outline-[#1d6c67]"
          >
            ถัดไป <ChevronRight aria-hidden="true" size={16} />
          </Link>
        ) : (
          <span className="inline-flex cursor-not-allowed items-center gap-1 border border-[#d5dad5] px-3 py-2 text-[#9da5a2]">
            ถัดไป <ChevronRight aria-hidden="true" size={16} />
          </span>
        )}
      </div>
    </div>
  );
}
