import type { ReactNode } from 'react'

export type IconName =
  | 'back'
  | 'play'
  | 'pause'
  | 'volume'
  | 'mute'
  | 'fullscreen'
  | 'exit-fullscreen'
  | 'settings'
  | 'check'
  | 'chevron-up'
  | 'retry'
  | 'alert'
  | 'replay'
  | 'speed'
  | 'wifi'
  | 'wifi-off'
  | 'close'
  | 'spark'

interface IconProps {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}

function content(name: IconName): ReactNode {
  switch (name) {
    case 'back':
      return <path d="M15 18.5 6.5 12 15 5.5" />
    case 'play':
      return <path d="M8.2 5.2 19 12 8.2 18.8Z" fill="currentColor" stroke="none" />
    case 'pause':
      return (
        <g fill="currentColor" stroke="none">
          <rect x="7" y="5" width="3.6" height="14" rx="1" />
          <rect x="13.4" y="5" width="3.6" height="14" rx="1" />
        </g>
      )
    case 'volume':
      return (
        <>
          <path d="M4 9.5v5h3.6L13 19V5L7.6 9.5Z" />
          <path d="M16.4 8.5a5 5 0 0 1 0 7" />
          <path d="M19 6a8.5 8.5 0 0 1 0 12" />
        </>
      )
    case 'mute':
      return (
        <>
          <path d="M4 9.5v5h3.6L13 19V5L7.6 9.5Z" />
          <path d="m17 9 5 5M22 9l-5 5" />
        </>
      )
    case 'fullscreen':
      return (
        <>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </>
      )
    case 'exit-fullscreen':
      return (
        <>
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        </>
      )
    case 'settings':
      return (
        <>
          <path d="M5 7h14M5 17h14" />
          <circle cx="9" cy="7" r="2.2" fill="var(--surface, #111)" />
          <circle cx="15" cy="17" r="2.2" fill="var(--surface, #111)" />
        </>
      )
    case 'check':
      return <path d="m5 12.5 4.3 4.3L19 6.8" />
    case 'chevron-up':
      return <path d="m7 14 5-5 5 5" />
    case 'retry':
      return (
        <>
          <path d="M4.5 10a7.5 7.5 0 1 1 1.8 6.2" />
          <path d="M4.5 5v5h5" />
        </>
      )
    case 'alert':
      return (
        <>
          <path d="M12 3.5 21 20H3Z" />
          <path d="M12 9v5" />
          <circle cx="12" cy="17.2" r=".9" fill="currentColor" stroke="none" />
        </>
      )
    case 'replay':
      return (
        <>
          <path d="M4.5 9V4.5H9" />
          <path d="M5 9a8 8 0 1 1-.7 7" />
        </>
      )
    case 'speed':
      return (
        <>
          <path d="M4.5 18a9 9 0 1 1 15 0" />
          <path d="m12 14 4-4" />
          <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
        </>
      )
    case 'wifi':
      return (
        <>
          <path d="M3.5 9.5a13 13 0 0 1 17 0" />
          <path d="M7 13a8 8 0 0 1 10 0" />
          <path d="M10.2 16.4a3.2 3.2 0 0 1 3.6 0" />
          <circle cx="12" cy="19.3" r=".9" fill="currentColor" stroke="none" />
        </>
      )
    case 'wifi-off':
      return (
        <>
          <path d="M3.5 9.5a13 13 0 0 1 5-2.8M15.5 7.2a13 13 0 0 1 5 2.3" />
          <path d="M7 13a8 8 0 0 1 3.5-1.5M17 13a8 8 0 0 0-2-1.2" />
          <path d="M10.2 16.4a3.2 3.2 0 0 1 3.6 0" />
          <circle cx="12" cy="19.3" r=".9" fill="currentColor" stroke="none" />
          <path d="M3 3l18 18" />
        </>
      )
    case 'close':
      return <path d="m6 6 12 12M18 6 6 18" />
    case 'spark':
      return (
        <>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
          <path d="m6 6 2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
        </>
      )
    default:
      return null
  }
}

export function Icon({
  name,
  size = 22,
  className,
  strokeWidth = 1.8
}: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {content(name)}
    </svg>
  )
}