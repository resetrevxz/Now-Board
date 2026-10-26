export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <path
        d="M12 3.6a8.4 8.4 0 0 1 8.4 8.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3.1" fill="var(--accent, #4ade9d)" />
      <circle cx="12" cy="12" r="5.4" stroke="var(--accent, #4ade9d)" strokeWidth="1.4" opacity="0.35" />
    </svg>
  );
}
