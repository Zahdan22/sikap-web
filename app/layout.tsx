import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import SplashScreen from "@/components/SplashScreen";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SIKAP - Solusi Absensi Karyawan Digital",
  description: "Aplikasi absensi karyawan Tjap Djajakarta",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SIKAP",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-cream text-ink font-sans">
        <SplashScreen />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}