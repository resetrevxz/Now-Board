import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'plus'
  | 'check'
  | 'check-circle'
  | 'circle'
  | 'x'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-right'
  | 'chevron-left'
  | 'more'
  | 'search'
  | 'command'
  | 'grip'
  | 'eye'
  | 'eye-off'
  | 'clock'
  | 'target'
  | 'flag'
  | 'trash'
  | 'pencil'
  | 'sliders'
  | 'monitor'
  | 'coffee'
  | 'sparkles'
  | 'flame'
  | 'lock'
  | 'download'
  | 'upload'
  | 'folder'
  | 'shield'
  | 'play'
  | 'pause'
  | 'reset'
  | 'sun'
  | 'moon'
  | 'palette'
  | 'wifi'
  | 'external'
  | 'calendar'
  | 'link'
  | 'list'
  | 'minimize'
  | 'maximize'
  | 'restore'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-right'
  | 'arrow-left'
  | 'dot'
  | 'bolt'
  | 'clock-plus'
  | 'image';

const paths: Record<IconName, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m20 6-11 11-5-5" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  circle: <circle cx="12" cy="12" r="8.5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-up': <path d="m18 15-6-6-6 6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="2.4" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7.5" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  command: (
    <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0 3-3" />
  ),
  grip: (
    <path
      d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01"
      strokeWidth="2.4"
    />
  ),
  eye: (
    <>
      <path d="M2.2 12.4a1 1 0 0 1 0-.8C4.1 7.9 7.9 5 12 5s7.9 2.9 9.8 6.6a1 1 0 0 1 0 .8C19.9 16.1 16.1 19 12 19s-7.9-2.9-9.8-6.6Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c4.1 0 7.9 2.9 9.8 6.6a1 1 0 0 1 0 .8 11.7 11.7 0 0 1-3 3.8" />
      <path d="M6.4 6.4a11.7 11.7 0 0 0-4.2 5.2 1 1 0 0 0 0 .8C4.1 16.1 7.9 19 12 19c1.9 0 3.6-.6 5.1-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 2" />
    </>
  ),
  'clock-plus': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l2 1.2M17.5 17.5 21 21" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4.8c2.8-1.8 5.6-.2 8.4.7 2.1.7 4.1.2 5.6-.8v8.5c-1.5 1-3.5 1.5-5.6.8-2.8-.9-5.6-2.5-8.4-.7" />
    </>
  ),
  trash: (
    <>
      <path d="M3.5 6.5h17M18.5 6.5V19a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V6.5" />
      <path d="M8.5 6.5V4.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2M10 11v5.5M14 11v5.5" />
    </>
  ),
  pencil: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M1 14h6M9 8h6M17 16h6" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="3.5" width="19" height="13.5" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  coffee: (
    <>
      <path d="M17 9h1a3.5 3.5 0 0 1 0 7h-1" />
      <path d="M3 9h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
      <path d="M7 2.5v2M11 2.5v2M15 2.5v2" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.2 13.6 8l4.8 1.6-4.8 1.6L12 16l-1.6-4.8L5.6 9.6 10.4 8Z" />
      <path d="M18.5 15.5 19.3 18l2.5.8-2.5.8-.8 2.5-.8-2.5-2.5-.8 2.5-.8Z" />
    </>
  ),
  flame: (
    <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S13 6.5 12.5 4c-2.24 1.95-3.07 3.86-2 6 .5 1 1 1.62 1 3a2.5 2.5 0 0 1-4 2c-.57.7-1 1.85-1 3a7 7 0 0 0 5.5 4Z" />
  ),
  lock: (
    <>
      <rect x="3.5" y="10.5" width="17" height="10.5" rx="2" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5M12 15V3" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5M12 3v12" />
    </>
  ),
  folder: (
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
  ),
  shield: <path d="M12 22s8-4 8-10V5.2L12 2 4 5.2V12c0 6 8 10 8 10Z" />,
  play: <path d="M8 5.1v13.8a.8.8 0 0 0 1.22.68l10.7-6.9a.8.8 0 0 0 0-1.36L9.22 4.42A.8.8 0 0 0 8 5.1Z" />,
  pause: (
    <>
      <rect x="7" y="4.5" width="3.5" height="15" rx="1.2" />
      <rect x="13.5" y="4.5" width="3.5" height="15" rx="1.2" />
    </>
  ),
  reset: (
    <>
      <path d="M3.2 12a8.8 8.8 0 1 0 2.9-6.5L3 8.5" />
      <path d="M3 3.5v5h5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
    </>
  ),
  moon: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />,
  palette: (
    <>
      <path d="M12 22a10 10 0 1 1 10-10c0 2.2-1.8 4-4 4h-1.5a1.5 1.5 0 0 0-1.06 2.56c.3.3.56.64.56 1.19A2.25 2.25 0 0 1 12 22Z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  wifi: (
    <>
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <path d="M12 20h.01" strokeWidth="2.4" />
    </>
  ),
  external: (
    <>
      <path d="M15 3h6v6M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <path d="M16 2.5v4M8 2.5v4M3 10h18" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeWidth="2.2" />
    </>
  ),
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5" y="5" width="14" height="14" rx="1.5" />,
  restore: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="1.5" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </>
  ),
  'arrow-up': <path d="M12 19V5M5 12l7-7 7 7" />,
  'arrow-down': <path d="M12 5v14M19 12l-7 7-7-7" />,
  'arrow-right': <path d="M5 12h14M13 5l7 7-7 7" />,
  'arrow-left': <path d="M19 12H5M11 19l-7-7 7-7" />,
  dot: <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />,
  bolt: <path d="M13 2 4.5 13.5H11l-1 8.5L18.5 10H12Z" />,
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, strokeWidth = 1.7, ...rest }: IconProps) {
  return (
    <svg
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
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
