import type { Metadata } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";

import { siteConfig } from "@/config/site";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import Providers from "./providers";
import "./globals.css";
// KaTeX layout rules for the math the chat Markdown renders via rehype-katex.
import "katex/dist/katex.min.css";

// Body and normal text. Geist is a variable font, so every weight ships in one
// file and there is no per-weight request.
const geist = Geist({
  variable: "--font-body",
  subsets: ["latin"],
});

// Headers. Mona Sans, used at bold by the ws-display utility. Shared with the
// Worldstreet frontend so headings match across the two apps.
const monaSans = localFont({
  src: "./fonts/mona-sans-latin.woff2",
  weight: "500 700",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${monaSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme before the first paint. An effect would
            paint dark first and then correct it. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
