import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/providers/providers";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const description =
  "Create events, manage registrations, collect payments, track attendance, issue certificates and analyze performance from one centralized platform.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Campus Event Hub — Manage every college event in one place", template: "%s · Campus Event Hub" },
  description,
  applicationName: "Campus Event Hub",
  keywords: ["college events", "event management", "event registration", "QR attendance", "certificates", "Razorpay"],
  openGraph: { type: "website", siteName: "Campus Event Hub", title: "Campus Event Hub", description, url: siteUrl, locale: "en_IN" },
  twitter: { card: "summary_large_image", title: "Campus Event Hub", description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#181a24" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
