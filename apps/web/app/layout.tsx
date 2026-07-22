import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  description: "输入一个字，查看来源可靠的历代名家写法。",
  metadataBase: new URL(process.env.PUBLIC_WEB_URL ?? "http://localhost:3000"),
  title: "名家书法单字库",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
