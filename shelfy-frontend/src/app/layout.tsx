import type { Metadata } from "next";
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
  title: {
    default: "Shelfy",
    template: "%s | Shelfy",
  },
  description: "Panel de gestión Shelfy",
  // REGLA DE ORO: no quitar metadata.icons — ver .cursor/rules/shelfy-favicon.mdc
  icons: {
    icon: [{ url: "/WEBICON.svg", type: "image/svg+xml" }],
    apple: [{ url: "/WEBICON.svg", type: "image/svg+xml" }],
  },
};

import { UIProvider } from "@/contexts/UIContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ReactQueryProvider } from "@/components/providers/ReactQueryProvider";
import { PortalCacheProvider } from "@/components/providers/PortalCacheProvider";
import { Toaster } from "@/components/ui/sonner";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";
import { SystemShieldBanner } from "@/components/SystemShieldBanner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ReactQueryProvider>
          <AuthProvider>
            <PortalCacheProvider>
              <UIProvider>
                <SystemShieldBanner />
                {children}
                <Toaster richColors position="top-right" />
                <SpeedInsights />
                <Analytics />
              </UIProvider>
            </PortalCacheProvider>
          </AuthProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
