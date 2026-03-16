import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ZinaLog",
  description: "lightweight self-hosted logging dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Link
          href="https://zinalog.com"
          target="_blank"
          rel="noopener noreferrer"
          className="group fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
        >
          <span className="relative inline-flex items-center rounded-full p-px">
            <span className="relative flex items-center gap-2 rounded-full bg-neutral-950/85 px-4 py-2 text-[11px] font-medium text-neutral-300 backdrop-blur-md">
              <span className="opacity-70">Powered by</span>
              <span className="font-semibold text-blue-400">ZinaLog</span>
            </span>
          </span>
        </Link>
      </body>
    </html>
  );
}
