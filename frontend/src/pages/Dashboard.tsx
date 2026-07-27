import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { HealthResponse, ServiceStatus } from "@/types";

const SERVICE_LABELS: Record<keyof HealthResponse["services"], string> = {
  database: "Database",
  ffmpeg: "FFmpeg",
  ollama: "Ollama (Qwen3)",
  storage: "Storage",
};

function StatusDot({ status }: { status: ServiceStatus }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
        status === "ok"
          ? "bg-studio-accent"
          : status === "offline"
          ? "bg-studio-neutral"
          : "bg-red-500"
      }`}
    />
  );
}

function StatusBadge({ status }: { status: ServiceStatus }) {
  const cls =
    status === "ok"
      ? "text-studio-accent border-studio-accent/30 bg-studio-accent/10"
      : status === "offline"
      ? "text-studio-neutral border-studio-neutral/30 bg-studio-neutral/10"
      : "text-red-400 border-red-900/40 bg-red-900/20";

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-medium ${cls}`}>
      <StatusDot status={status} />
      {status}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="panel p-4 animate-pulse flex items-center justify-between">
      <div className="h-3 bg-studio-neutral/20 rounded w-24" />
      <div className="h-4 bg-studio-neutral/20 rounded w-14" />
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, isError, error } = useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: () => api.get<HealthResponse>("/api/v1/health"),
    refetchInterval: 30_000,
  });

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight text-studio-text mb-1">
        System Status
      </h1>
      <p className="text-xs text-studio-neutral mb-8">
        Backend services and dependency health.
      </p>

      {isLoading && (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {isError && (
        <div className="panel border-red-900/40 bg-red-900/10 p-4 text-xs text-red-400">
          <p className="font-medium mb-1">Cannot reach backend.</p>
          <p className="text-red-500/80">
            {error instanceof Error ? error.message : "Unknown error."}
          </p>
          <p className="mt-2 text-studio-neutral font-mono">
            uvicorn app.main:app --reload
          </p>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {(Object.entries(data.services) as [keyof typeof data.services, ServiceStatus][]).map(
              ([key, status]) => (
                <div
                  key={key}
                  className="panel p-4 flex items-center justify-between"
                >
                  <span className="text-xs text-studio-muted">{SERVICE_LABELS[key]}</span>
                  <StatusBadge status={status} />
                </div>
              )
            )}
          </div>

          <div className="flex items-center gap-3 text-[10px] text-studio-neutral font-mono">
            <span>API v{data.version}</span>
            <span className="text-studio-neutral/40">·</span>
            <span className="flex items-center gap-1.5">
              Overall <StatusBadge status={data.status} />
            </span>
          </div>
        </>
      )}
    </div>
  );
}
