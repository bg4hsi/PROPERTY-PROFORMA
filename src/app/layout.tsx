import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "投资测算 · 房地产投资分析", description: "房地产项目投资利润测算应用" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
