export async function waitForPrintLayout(): Promise<void> {
  await document.fonts.ready;
  const signatures = document.querySelectorAll<HTMLImageElement>(".hg-print-document [data-report-signature] img");
  try {
    await Promise.all(Array.from(signatures, async (image) => {
      await image.decode();
      if (!image.naturalWidth) throw new Error("Empty signature image");
    }));
  } catch {
    throw new Error("โหลดลายเซ็นสำหรับรายงานไม่สำเร็จ กรุณาโหลดหน้าใหม่ก่อนพิมพ์");
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export async function printWhenReady(): Promise<void> {
  await waitForPrintLayout();
  window.print();
}
