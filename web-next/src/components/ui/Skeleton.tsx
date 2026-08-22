export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-control)] bg-[var(--surface-raised)] ${className}`}
      aria-hidden="true"
    />
  );
}
