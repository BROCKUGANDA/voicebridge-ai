import type { Metadata } from "next"
import { Space_Grotesk, JetBrains_Mono } from "next/font/google"
import "./globals.css"

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
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
    icon: "/favicon.svg",
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
        className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased bg-[#0A0E17] text-white overflow-hidden`}
      >
        {children}
        {/* Screen reader live region — the app's feedback channel is
            sound + aria-live announcements, not visual toasts. */}
        <div id="vb-sr-announcer" className="sr-only" aria-live="assertive" aria-atomic="true" />
      </body>
    </html>
  )
}