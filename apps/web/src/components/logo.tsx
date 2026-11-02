import { useId } from "react";

/**
 * CareerFlow mark: a "C" that opens into a rising growth line —
 * your career flowing upward. Gradient: indigo → violet → pink.
 */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} role="img" aria-label="CareerFlow AI">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="0.55" stopColor="#A855F7" />
          <stop offset="1" stopColor="#EC4899" />
        </linearGradient>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#g${id})`} />
      <rect width="48" height="48" rx="14" fill={`url(#s${id})`} />
      {/* the C */}
      <path d="M33.2 15.6A12 12 0 1 0 33.2 32.4" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
      {/* rising growth line leaving the C */}
      <path d="M19 28.5l5-5 3.5 3L37 17" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M31.5 16.2H37.6V22.3" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ size = 32, className = "", text = true }: { size?: number; className?: string; text?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} className="logo-mark shrink-0" />
      {text && (
        <span className="text-[17px] font-bold tracking-tight">
          CareerFlow <span className="text-gradient">AI</span>
        </span>
      )}
    </span>
  );
}

export function CreatedBy({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-muted ${className}`}>
      Created by{" "}
      <a href="https://ajay-bj-portfolio.netlify.app" target="_blank" rel="noopener noreferrer" className="font-semibold text-gradient hover:opacity-80">
        Ajay B J
      </a>{" "}
      · Owner
    </p>
  );
}
