import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { QueryProvider, ThemeProvider, Toaster } from "@staffly/ui";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_ADMIN_BASE_URL ?? "http://localhost:3000",
  ),
  title: "Staffly Admin",
  description: "PeopleFlow HRMS — Admin Portal",
  openGraph: {
    title: "Staffly Admin",
    description: "PeopleFlow HRMS — Admin Portal",
    url: "/",
    siteName: "Staffly Admin",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Staffly Admin dashboard preview",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Staffly Admin",
    description: "PeopleFlow HRMS — Admin Portal",
    images: [
      {
        url: "/opengraph-image",
        alt: "Staffly Admin dashboard preview",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="font-sans antialiased">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-1.5 focus:text-sm focus:shadow"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <QueryProvider>
            <div id="content">{children}</div>
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
