import { useEffect, useRef, useState } from "react";
import { streamEditingPlan, streamExecutePlan } from "@/api/client";
import type { EditingCommand, EditingPlan } from "@/types";

const ACTION_LABELS: Record<EditingCommand["action"], string> = {
  remove_silence: "Remove silence segments",
  remove_fillers: "Remove filler words",
  generate_subtitles: "Generate subtitles",
  export: "Export video",
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
  done: "✓",
  error: "✗",
  warning: "⚠",
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
    <div className="flex flex-col gap-3 border-t border-gray-800 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          AI Assistant
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "Remove all silences and filler words, then export at 720p"'
          disabled={isStreaming}
          rows={2}
          className="w-full rounded bg-gray-800 border border-gray-700 text-xs text-gray-200 placeholder-gray-600 px-2 py-1.5 resize-none focus:outline-none focus:border-blue-700 disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={isStreaming || !prompt.trim()}
          className="px-3 py-1 rounded text-xs bg-blue-900 text-blue-200 hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-start"
        >
          {isStreaming ? "Thinking…" : "Generate Plan"}
        </button>
      </div>

      {isStreaming && streamingText && (
        <pre className="text-[10px] text-gray-500 whitespace-pre-wrap break-words max-h-24 overflow-y-auto bg-gray-950 rounded px-2 py-1">
          {streamingText}
        </pre>
      )}

      {plan && !isStreaming && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
            Editing Plan
          </span>
          <ol className="flex flex-col gap-1">
            {plan.commands.map((cmd, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-gray-300 bg-gray-800 rounded px-2 py-1"
              >
                <span className="text-blue-400 font-bold shrink-0">{i + 1}.</span>
                <span>
                  {ACTION_LABELS[cmd.action]}
                  {cmd.params && (
                    <span className="text-gray-500">{formatParams(cmd.params)}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          {plan.warnings.length > 0 && (
            <p className="text-[10px] text-yellow-600 mt-1">
              Unsupported actions ignored: {plan.warnings.join(", ")}
            </p>
          )}
          <button
            onClick={handleExecute}
            disabled={isStreaming || isExecuting}
            className="mt-2 px-3 py-1 rounded text-xs bg-green-900 text-green-200 hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-start"
          >
            {isExecuting ? "Executing…" : "Execute Plan"}
          </button>

          {executionSteps.length > 0 && (
            <ol className="flex flex-col gap-1 mt-2">
              {executionSteps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs rounded px-2 py-1 bg-gray-900">
                  <span className={
                    s.status === "done" ? "text-green-400" :
                    s.status === "running" ? "text-blue-400" :
                    s.status === "error" ? "text-red-400" :
                    s.status === "warning" ? "text-yellow-400" :
                    "text-gray-600"
                  }>
                    {STATUS_ICON[s.status]}
                  </span>
                  <span className="text-gray-300">
                    {ACTION_LABELS[s.action as EditingCommand["action"]] ?? s.action}
                    {s.detail && <span className="text-gray-500 ml-1">— {s.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {executionError && (
            <p className="text-xs text-red-400 mt-1">Execution stopped: {executionError}</p>
          )}

          {executedPlanUrl && (() => {
            const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
            const isStream = executedPlanUrl.includes("/stream");
            const fullUrl = `${BASE}${executedPlanUrl}`;
            return (
              <div className="flex flex-col gap-2 mt-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Processed Preview
                </span>
                {isStream ? (
                  <video controls className="w-full rounded" src={fullUrl} />
                ) : (
                  <a
                    href={fullUrl}
                    download
                    className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs bg-blue-900 text-blue-200 hover:bg-blue-800 transition-colors self-start"
                  >
                    Download Edited Video
                  </a>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
