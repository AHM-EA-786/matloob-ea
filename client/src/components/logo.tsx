interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  variant?: "dark" | "light";
}

export function Logo({ size = 36, className = "", showText = true, variant = "dark" }: LogoProps) {
  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-label="Matloob Tax & Consulting"
    >
      {/* Shield outline */}
      <path
        d="M24 3L42 10V22C42 34 34 42 24 45C14 42 6 34 6 22V10L24 3Z"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      {/* Gold M inside */}
      <path
        d="M15 32V16L20 16L24 24L28 16L33 16V32"
        stroke="hsl(42 90% 45%)"
        strokeWidth="2.5"
        strokeLinejoin="miter"
        strokeLinecap="square"
        fill="none"
      />
    </svg>
  );
  if (!showText) return <span className={className}>{mark}</span>;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {mark}
      <div className="flex flex-col leading-tight">
        <span className="font-serif text-[15px] font-normal tracking-tight">Matloob Tax</span>
        <span className={`text-[10px] uppercase tracking-[0.18em] ${variant === "light" ? "text-white/60" : "text-muted-foreground"}`}>
          Client Portal
        </span>
      </div>
    </div>
  );
}
