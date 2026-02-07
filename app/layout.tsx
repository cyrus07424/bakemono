import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BAKEMONO - 2D見下ろし型アクションゲーム",
  description: "上を目指して敵を倒せ！スマホではドラッグ、PCでは矢印キーで操作する2Dアクションゲーム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
