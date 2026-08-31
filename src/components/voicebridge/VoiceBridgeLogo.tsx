'use client'

import { cn } from '@/lib/utils'

interface VoiceBridgeLogoProps {
  size?: number
  className?: string
}

export function VoiceBridgeLogo({ size = 32, className }: VoiceBridgeLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="VoiceBridge AI logo"
    >
      <defs>
        {/* Gradient for soundwave bars: cyan to teal */}
        <linearGradient id="vb-bar-gradient" x1="32" y1="18" x2="32" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00F0FF" />
          <stop offset="100%" stopColor="#5CE0D8" />
        </linearGradient>

        {/* Subtle glow filter for the ring */}
        <filter id="vb-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Gradient for bridge arc */}
        <linearGradient id="vb-arc-gradient" x1="20" y1="16" x2="44" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5CE0D8" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#00F0FF" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#5CE0D8" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* Outer ring */}
      <circle
        cx="32"
        cy="32"
        r="29"
        stroke="#00F0FF"
        strokeWidth="1.5"
        fill="none"
        filter="url(#vb-glow)"
        opacity="0.7"
      />

      {/* Inner subtle ring for depth */}
      <circle
        cx="32"
        cy="32"
        r="25"
        stroke="#00F0FF"
        strokeWidth="0.5"
        fill="none"
        opacity="0.2"
      />

      {/* Bridge arc connecting the wave bars at the top */}
      <path
        d="M 20 24 Q 32 12 44 24"
        stroke="url(#vb-arc-gradient)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Left soundwave bar (shorter) */}
      <rect
        x="22"
        y="30"
        width="4"
        height="12"
        rx="2"
        fill="url(#vb-bar-gradient)"
        opacity="0.85"
      >
        <animate
          attributeName="height"
          values="12;15;12"
          dur="1.8s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
        />
        <animate
          attributeName="y"
          values="30;28.5;30"
          dur="1.8s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
        />
      </rect>

      {/* Center soundwave bar (tallest) */}
      <rect
        x="30"
        y="24"
        width="4"
        height="22"
        rx="2"
        fill="url(#vb-bar-gradient)"
      >
        <animate
          attributeName="height"
          values="22;26;22"
          dur="1.4s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
        />
        <animate
          attributeName="y"
          values="24;22;24"
          dur="1.4s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
        />
      </rect>

      {/* Right soundwave bar (shorter) */}
      <rect
        x="38"
        y="30"
        width="4"
        height="12"
        rx="2"
        fill="url(#vb-bar-gradient)"
        opacity="0.85"
      >
        <animate
          attributeName="height"
          values="12;14;12"
          dur="2s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
        />
        <animate
          attributeName="y"
          values="30;29;30"
          dur="2s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
        />
      </rect>

      {/* Small baseline */}
      <line
        x1="20"
        y1="46"
        x2="44"
        y2="46"
        stroke="#5CE0D8"
        strokeWidth="0.75"
        strokeLinecap="round"
        opacity="0.3"
      />

      {/* Small accessibility dots flanking the wave - left */}
      <circle cx="16" cy="36" r="1" fill="#00F0FF" opacity="0.4">
        <animate
          attributeName="opacity"
          values="0.2;0.6;0.2"
          dur="2.5s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Small accessibility dots flanking the wave - right */}
      <circle cx="48" cy="36" r="1" fill="#00F0FF" opacity="0.4">
        <animate
          attributeName="opacity"
          values="0.2;0.6;0.2"
          dur="2.5s"
          repeatCount="indefinite"
          begin="0.3s"
        />
      </circle>
    </svg>
  )
}
