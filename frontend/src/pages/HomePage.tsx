import { useNavigate } from "react-router-dom";

interface ModeCardProps {
  title: string;
  subtitle: string;
  description: string;
  steps: string[];
  color: "violet" | "teal";
  onClick: () => void;
}

function ModeCard({ title, subtitle, description, steps, color, onClick }: ModeCardProps) {
  const accent = color === "violet"
    ? { border: "border-violet-700", bg: "bg-violet-900/30", btn: "bg-violet-600 hover:bg-violet-500", dot: "bg-violet-500", text: "text-violet-300" }
    : { border: "border-teal-700", bg: "bg-teal-900/30", btn: "bg-teal-600 hover:bg-teal-500", dot: "bg-teal-500", text: "text-teal-300" };

  return (
    <div
      className={`flex flex-col gap-5 rounded-2xl border ${accent.border} ${accent.bg} p-8 cursor-pointer hover:scale-[1.02] transition-transform`}
      onClick={onClick}
    >
      <div>
        <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${accent.text}`}>{subtitle}</p>
        <h2 className="text-2xl font-bold text-white">{title}</h2>
        <p className="text-gray-400 text-sm mt-2">{description}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {steps.map((step) => (
          <li key={step} className="flex items-center gap-2 text-sm text-gray-300">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${accent.dot}`} />
            {step}
          </li>
        ))}
      </ul>

      <button
        className={`mt-auto w-full py-2.5 rounded-lg text-white font-semibold text-sm ${accent.btn} transition-colors`}
        onClick={onClick}
      >
        Get Started
      </button>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto py-10">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-violet-600 rounded-2xl mb-4">
          <span className="text-2xl font-bold text-white">AI</span>
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">AI Video Editor</h1>
        <p className="text-gray-400 text-base">
          Local · Free · No cloud. Choose how you want to edit.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <ModeCard
          title="Manual Editing"
          subtitle="Step by step"
          description="Full control over every editing step. Run each tool individually and review results before applying."
          steps={[
            "Upload your video",
            "Transcribe with Whisper AI",
            "Detect & remove silences",
            "Detect & remove filler words",
            "Generate subtitles",
            "Export final video",
          ]}
          color="violet"
          onClick={() => navigate("/library?mode=manual")}
        />

        <ModeCard
          title="AI Prompt Editing"
          subtitle="One prompt does it all"
          description="Describe what you want in plain English. The AI builds an editing plan and executes it for you automatically."
          steps={[
            "Upload your video",
            'Type: "remove silences and fillers"',
            "AI generates an editing plan",
            "Review the plan",
            "Execute with one click",
            "Export final video",
          ]}
          color="teal"
          onClick={() => navigate("/library?mode=ai")}
        />
      </div>

      <p className="text-center text-xs text-gray-600 mt-8">
        You can switch modes anytime from the library.
      </p>
    </div>
  );
}
