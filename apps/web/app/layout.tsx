import type { Metadata } from "next";
import localFont from "next/font/local";
import { WsProvider } from "@/lib/ws/hooks";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "PlayHive",
  description: "Real-time board games",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-white text-gray-900 antialiased`}>
        <WsProvider>{children}</WsProvider>
      </body>
    </html>
  );
}
