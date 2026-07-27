import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { HealthResponse, ServiceStatus } from "@/types";

const SERVICE_LABELS: Record<keyof HealthResponse["services"], string> = {
  database: "Database",
  ffmpeg: "FFmpeg",
  ollama: "Ollama (Qwen3)",
  storage: "Storage",
};

function StatusBadge({ status }: { status: ServiceStatus }) {
  const styles: Record<ServiceStatus, string> = {
    ok: "bg-green-900 text-green-300 border border-green-700",
    offline: "bg-yellow-900 text-yellow-300 border border-yellow-700",
    error: "bg-red-900 text-red-300 border border-red-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-24 mb-2" />
      <div className="h-5 bg-gray-700 rounded w-12" />
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
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">AI Video Editor</h1>
      <p className="text-gray-400 text-sm mb-8">
        Open-source · Runs locally · No cloud
      </p>

      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        System Status
      </h2>

      {isLoading && (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {isError && (
        <div className="bg-red-950 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
          <strong>Cannot reach backend.</strong>{" "}
          {error instanceof Error ? error.message : "Unknown error."}
          <p className="mt-1 text-red-400 text-xs">
            Make sure the backend is running: <code>uvicorn app.main:app --reload</code>
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
                  className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between"
                >
                  <span className="text-sm text-gray-300">{SERVICE_LABELS[key]}</span>
                  <StatusBadge status={status} />
                </div>
              )
            )}
          </div>
          <p className="text-xs text-gray-600">
            API version {data.version} · Overall:{" "}
            <StatusBadge status={data.status} />
          </p>
        </>
      )}
    </div>
  );
}
