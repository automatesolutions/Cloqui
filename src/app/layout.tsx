import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

// Fontshare fonts under the ITF Free Font License: self-hosted, files served unchanged.
const switzer = localFont({
  src: [
    { path: "./fonts/Switzer-Variable.woff2", style: "normal", weight: "100 900" },
    { path: "./fonts/Switzer-VariableItalic.woff2", style: "italic", weight: "100 900" },
  ],
  variable: "--font-switzer",
  display: "swap",
})

const cabinet = localFont({
  src: "./fonts/CabinetGrotesk-Variable.woff2",
  weight: "100 900",
  variable: "--font-cabinet",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "Cloqui", template: "%s · Cloqui" },
  description: "Record it, share it, discuss it, and track it. Only with the people you invite.",
  // Private by default. Only the landing page opts back in to indexing.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0e1420" },
    { media: "(prefers-color-scheme: light)", color: "#f6f7fa" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${switzer.variable} ${cabinet.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeProvider>
          <TooltipProvider delayDuration={400}>
            {children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
