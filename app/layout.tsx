import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import SplashScreen from "@/components/SplashScreen";
import DialogProvider from '@/components/ui/DialogProvider'
import NavigationOverlay from '@/components/NavigationOverlay'
import BottomNav from '@/components/BottomNav'

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SIKAP - Solusi Absensi Karyawan Digital",
  description: "Aplikasi absensi karyawan berbasis web",
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
        <DialogProvider>
          {children}
          <BottomNav />
        </DialogProvider>
        <NavigationOverlay />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}