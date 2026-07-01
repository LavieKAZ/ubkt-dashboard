import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Lịch công tác cơ quan",
  description: "Ứng dụng quản lý lịch công tác và trợ lý lịch họp"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body className={`${inter.variable} antialiased`}>{children}</body></html>;
}
