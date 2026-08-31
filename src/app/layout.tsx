import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "VoiceBridge AI - Voice-First Accessibility Assistant",
  description:
    "VoiceBridge AI is a voice-first accessibility assistant designed for users with visual impairments. Navigate digital interfaces through voice commands with intelligent context-aware assistance.",
  keywords: [
    "accessibility",
    "voice assistant",
    "screen reader",
    "visual impairment",
    "AssemblyAI",
    "voice AI",
    "WCAG",
  ],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0A0E17] text-white overflow-hidden`}
      >
        {children}
        <Toaster />
        {/* Screen reader live region */}
        <div id="vb-sr-announcer" className="sr-only" aria-live="assertive" aria-atomic="true" />
      </body>
    </html>
  )
}