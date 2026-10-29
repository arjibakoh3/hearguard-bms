import type { Metadata } from "next";
import { IBM_Plex_Mono, Noto_Sans_Thai } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: "variable",
  variable: "--font-hg-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-hg-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HearGuard",
  description:
    "ระบบดิจิทัลเฝ้าระวังสมรรถภาพการได้ยินแบบต่อเนื่องสำหรับผู้ปฏิบัติงานสัมผัสเสียงดัง",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="th"
      className={`${notoSansThai.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
