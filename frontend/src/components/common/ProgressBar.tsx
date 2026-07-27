interface ProgressBarProps {
  percent: number;
  label?: string;
}

export default function ProgressBar({ percent, label }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className="w-full flex flex-col gap-1">
      {label && (
        <p className="text-xs text-studio-muted font-medium">{label}</p>
      )}
      <div className="w-full bg-studio-bg rounded-full h-1.5 overflow-hidden border border-studio-neutral/10">
        <div
          className="h-full bg-studio-accent rounded-full transition-all duration-200 ease-out"
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
