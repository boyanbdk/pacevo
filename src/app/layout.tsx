import type { Metadata, Viewport } from "next";
import { BRAND_ASSETS, BRAND_DESCRIPTION, BRAND_NAME, BRAND_THEME_COLOR } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: BRAND_NAME,
  description: BRAND_DESCRIPTION,
  icons: {
    icon: [
      { url: BRAND_ASSETS.favicon, sizes: "32x32", type: "image/png" },
      { url: BRAND_ASSETS.icon, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: BRAND_ASSETS.appleTouchIcon, sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    images: [{ url: BRAND_ASSETS.socialCard, width: 1448, height: 1086, alt: BRAND_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    images: [BRAND_ASSETS.socialCard],
  },
};

export const viewport: Viewport = {
  themeColor: BRAND_THEME_COLOR,
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
