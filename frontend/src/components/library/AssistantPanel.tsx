import { useEffect, useRef, useState } from "react";
import { streamEditingPlan, streamExecutePlan } from "@/api/client";
import type { EditingCommand, EditingPlan } from "@/types";

const ACTION_LABELS: Record<EditingCommand["action"], string> = {
  remove_silence:    "Remove silence segments",
  remove_fillers:    "Remove filler words",
  generate_subtitles: "Generate subtitles",
  export:            "Export video",
};

type StepStatus = "pending" | "running" | "done" | "error" | "warning";

interface ExecutionStep {
  action: string;
  status: StepStatus;
  detail?: string;
}

const STATUS_ICON: Record<StepStatus, string> = {
  pending: "○",
  running: "◌",
  done:    "✓",
  error:   "✗",
  warning: "⚠",
};

const STATUS_COLOR: Record<StepStatus, string> = {
  pending: "text-studio-neutral",
  running: "text-studio-accent",
  done:    "text-studio-accent",
  error:   "text-red-400",
  warning: "text-studio-neutral",
};

interface AssistantPanelProps {
  videoId: string;
  onError: (message: string) => void;
  onExecuted?: (editedUrl: string) => void;
}

function formatParams(params: Record<string, unknown> | undefined): string {
  if (!params || Object.keys(params).length === 0) return "";
  return (
    " (" +
    Object.entries(params)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(", ") +
    ")"
  );
}

export default function AssistantPanel({ videoId, onError, onExecuted }: AssistantPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [plan, setPlan] = useState<EditingPlan | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [isExecuting, setIsExecuting] = useState(false);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [executedPlanUrl, setExecutedPlanUrl] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const abortExecuteRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortExecuteRef.current?.abort();
    };
  }, []);

  async function handleExecute() {
    if (!plan || isStreaming || isExecuting) return;
    const controller = new AbortController();
    abortExecuteRef.current = controller;
    setIsExecuting(true);
    setExecutedPlanUrl(null);
    setExecutionError(null);
    setExecutionSteps(plan.commands.map((cmd) => ({ action: cmd.action, status: "pending" })));

    try {
      for await (const event of streamExecutePlan(videoId, plan.commands, controller.signal)) {
        if (event.type === "progress") {
          setExecutionSteps((prev) =>
            prev.map((s) =>
              s.action === event.action
                ? { ...s, status: event.status === "started" ? "running" : "done" }
                : s,
            ),
          );
        } else if (event.type === "warning") {
          setExecutionSteps((prev) =>
            prev.map((s) =>
              s.action === event.action ? { ...s, status: "warning", detail: event.detail } : s,
            ),
          );
        } else if (event.type === "done") {
          setExecutedPlanUrl(event.executed_plan_path);
          onExecuted?.(event.executed_plan_path);
        } else if (event.type === "error") {
          setExecutionSteps((prev) =>
            prev.map((s) =>
              s.action === event.action ? { ...s, status: "error", detail: event.detail } : s,
            ),
          );
          setExecutionError(event.detail);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setExecutionError(err.message ?? "Failed to execute plan.");
      }
    } finally {
      setIsExecuting(false);
    }
  }

  async function handleSubmit() {
    if (!prompt.trim() || isStreaming) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);
    setStreamingText("");
    setPlan(null);
    setError(null);
    onError("");

    try {
      for await (const event of streamEditingPlan(videoId, prompt.trim(), controller.signal)) {
        if (event.type === "delta") {
          setStreamingText((t) => t + event.content);
        } else if (event.type === "plan") {
          setPlan({ commands: event.commands, warnings: event.warnings });
          setStreamingText("");
        } else if (event.type === "error") {
          setError(event.message);
          setStreamingText("");
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        const msg = err.message ?? "Failed to connect to AI service.";
        setError(msg);
        onError(msg);
      }
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-studio-neutral/20 pt-3">
      {/* Header */}
      <span className="section-label">AI Assistant</span>

      {/* Prompt input */}
      <div className="flex flex-col gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "Remove all silences and filler words, then export at 720p"'
          disabled={isStreaming}
          rows={2}
          className="w-full rounded bg-studio-bg border border-studio-neutral/20 text-xs text-studio-muted placeholder-studio-neutral/50 px-2.5 py-2 resize-none focus:outline-none focus:border-studio-accent transition-colors disabled:opacity-40 font-sans"
        />
        <button
          onClick={handleSubmit}
          disabled={isStreaming || !prompt.trim()}
          className="btn-primary self-start"
        >
          {isStreaming ? "Thinking…" : "Generate Plan"}
        </button>
      </div>

      {/* Streaming preview */}
      {isStreaming && streamingText && (
        <pre className="text-[10px] text-studio-neutral/70 whitespace-pre-wrap break-words max-h-24 overflow-y-auto bg-studio-bg border border-studio-neutral/10 rounded px-2.5 py-2 font-mono">
          {streamingText}
        </pre>
      )}

      {/* Generated plan */}
      {plan && !isStreaming && (
        <div className="flex flex-col gap-2">
          <span className="section-label">Editing Plan</span>

          <ol className="flex flex-col gap-1">
            {plan.commands.map((cmd, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-studio-muted bg-studio-bg border border-studio-neutral/10 rounded px-2.5 py-1.5"
              >
                <span className="text-studio-accent font-medium shrink-0 font-mono">{i + 1}.</span>
                <span>
                  {ACTION_LABELS[cmd.action]}
                  {cmd.params && (
                    <span className="text-studio-neutral font-mono">{formatParams(cmd.params)}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>

          {plan.warnings.length > 0 && (
            <p className="text-[10px] text-studio-neutral/70 font-mono">
              Skipped: {plan.warnings.join(", ")}
            </p>
          )}

          <button
            onClick={handleExecute}
            disabled={isStreaming || isExecuting}
            className="btn-primary self-start"
          >
            {isExecuting ? "Executing…" : "Execute Plan"}
          </button>

          {/* Execution step list */}
          {executionSteps.length > 0 && (
            <ol className="flex flex-col gap-1 mt-1">
              {executionSteps.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs bg-studio-bg border border-studio-neutral/10 rounded px-2.5 py-1.5"
                >
                  <span className={`font-mono shrink-0 ${STATUS_COLOR[s.status]}`}>
                    {STATUS_ICON[s.status]}
                  </span>
                  <span className="text-studio-muted">
                    {ACTION_LABELS[s.action as EditingCommand["action"]] ?? s.action}
                    {s.detail && (
                      <span className="text-studio-neutral ml-1 font-mono text-[10px]">— {s.detail}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {executionError && (
            <p className="text-[10px] text-red-400 font-mono">Error: {executionError}</p>
          )}

          {/* Processed preview */}
          {executedPlanUrl && (() => {
            const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
            const isStream = executedPlanUrl.includes("/stream");
            const fullUrl = `${BASE}${executedPlanUrl}`;
            return (
              <div className="flex flex-col gap-2 mt-1 pt-2 border-t border-studio-neutral/10">
                <span className="section-label">Processed Preview</span>
                {isStream ? (
                  <video controls className="w-full rounded" src={fullUrl} />
                ) : (
                  <a
                    href={fullUrl}
                    download
                    className="text-xs text-studio-accent hover:text-studio-accent-hover transition-colors"
                  >
                    ↓ Download Edited Video
                  </a>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {error && <p className="text-[10px] text-red-400 font-mono">{error}</p>}
    </div>
  );
}
