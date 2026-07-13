import type { Metadata, Viewport } from "next";
import { Poppins, Montserrat } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/components/providers/query-provider";
import AuthInitializer from "@/components/providers/auth-initializer";
import OfflineSyncProvider from "@/components/providers/offline-sync-provider";
import OfflineStatusBanner from "@/components/pwa/OfflineStatusBanner";
import { Toaster } from "sonner";

const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "Factory 23",
  description: "Factory 23 - Africa's Factory",
  applicationName: "Factory 23 Workforce",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Factory 23",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A1D25",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${montserrat.variable} ${poppins.className} h-full antialiased scroll-smooth`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <QueryProvider>
          <OfflineSyncProvider>
            <AuthInitializer>
              {children}
            </AuthInitializer>
            <OfflineStatusBanner />
          </OfflineSyncProvider>
        </QueryProvider>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
