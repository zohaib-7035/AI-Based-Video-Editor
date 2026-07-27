import { useNavigate } from "react-router-dom";

interface ModeCardProps {
  label: string;
  title: string;
  description: string;
  steps: string[];
  variant: "accent" | "neutral";
  onClick: () => void;
}

function ModeCard({ label, title, description, steps, variant, onClick }: ModeCardProps) {
  const isAccent = variant === "accent";

  return (
    <div
      onClick={onClick}
      className={`group flex flex-col gap-6 rounded-lg border bg-studio-surface p-6 cursor-pointer transition-colors ${
        isAccent
          ? "border-studio-accent/30 hover:border-studio-accent/60"
          : "border-studio-neutral/20 hover:border-studio-neutral/40"
      }`}
    >
      {/* Top label */}
      <div className="flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            isAccent ? "bg-studio-accent" : "bg-studio-neutral"
          }`}
        />
        <span
          className={`text-[10px] font-medium uppercase tracking-widest ${
            isAccent ? "text-studio-accent" : "text-studio-neutral"
          }`}
        >
          {label}
        </span>
      </div>

      {/* Heading + description */}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-studio-text">{title}</h2>
        <p className="text-xs text-studio-neutral leading-relaxed">{description}</p>
      </div>

      {/* Step list */}
      <ul className="flex flex-col gap-2">
        {steps.map((step) => (
          <li key={step} className="flex items-start gap-2.5 text-xs text-studio-muted">
            <span
              className={`mt-[3px] w-1 h-1 rounded-full shrink-0 ${
                isAccent ? "bg-studio-accent/60" : "bg-studio-neutral/60"
              }`}
            />
            {step}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={`mt-auto w-full py-2 rounded text-xs font-medium text-studio-text transition-colors ${
          isAccent
            ? "bg-studio-accent hover:bg-studio-accent-hover"
            : "bg-studio-neutral hover:bg-studio-neutral-hover"
        }`}
      >
        Get Started
      </button>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto py-8">
      {/* Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-studio-accent rounded-lg mb-5">
          <span className="text-base font-semibold text-studio-text">AI</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-studio-text mb-3">
          AI Video Editor
        </h1>
        <p className="text-sm text-studio-neutral">
          Local · Free · No cloud. Choose your editing mode.
        </p>
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ModeCard
          label="Step by step"
          title="Manual Editing"
          description="Full control over every step. Run each tool individually and review results before applying."
          steps={[
            "Upload your video",
            "Transcribe with Whisper AI",
            "Detect & remove silences",
            "Detect & remove filler words",
            "Generate subtitles",
            "Export final video",
          ]}
          variant="neutral"
          onClick={() => navigate("/library?mode=manual")}
        />

        <ModeCard
          label="One prompt"
          title="AI Prompt Editing"
          description='Describe what you want in plain English. The AI builds a plan and executes it automatically.'
          steps={[
            "Upload your video",
            'Type: "remove silences and fillers"',
            "AI generates an editing plan",
            "Review the plan",
            "Execute with one click",
            "Export final video",
          ]}
          variant="accent"
          onClick={() => navigate("/library?mode=ai")}
        />
      </div>

      <p className="text-center text-[10px] text-studio-neutral/60 mt-8 tracking-wide">
        Switch modes anytime from the library.
      </p>
    </div>
  );
}
