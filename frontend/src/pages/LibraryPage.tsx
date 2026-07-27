import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTranscriptionSocket,
  deleteVideo,
  detectFillers,
  detectSilence,
  generateSubtitles,
  getFillers,
  getSilence,
  getTranscript,
  getVideos,
  removeFillers,
  removeSilence,
  transcribeVideo,
} from "@/api/client";
import type { FillerDetection, SilenceDetection, Transcript } from "@/types";
import MenuBar from "@/components/nle/MenuBar";
import MediaBin from "@/components/nle/MediaBin";
import DualMonitor from "@/components/nle/DualMonitor";
import InspectorPanel from "@/components/nle/InspectorPanel";
import Timeline from "@/components/nle/Timeline";
import StatusBar from "@/components/nle/StatusBar";

type InspectorTab = "inspector" | "effects" | "ai" | "export";

type Snapshot = {
  transcript: Transcript | null;
  showTranscript: boolean;
  silenceDetection: SilenceDetection | null;
  fillerDetection: FillerDetection | null;
};

export default function LibraryPage() {
  const queryClient = useQueryClient();

  // ── Layout & mode ──────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState("select");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("inspector");
  const [mode, setMode] = useState<"manual" | "ai">("manual");

  // ── Playback ───────────────────────────────────────────────────────────────
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);

  // Ref exposed to Timeline so it can seek the video element directly
  const seekFnRef = useRef<((t: number) => void) | null>(null);

  // ── Editing state ──────────────────────────────────────────────────────────
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [silenceDetection, setSilenceDetection] = useState<SilenceDetection | null>(null);
  const [fillerDetection, setFillerDetection] = useState<FillerDetection | null>(null);
  const [transcriptProgress, setTranscriptProgress] = useState(0);

  // ── Error state ────────────────────────────────────────────────────────────
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [silenceError, setSilenceError] = useState<string | null>(null);
  const [fillerError, setFillerError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── History ────────────────────────────────────────────────────────────────
  const latestRef = useRef<Snapshot>({ transcript, showTranscript, silenceDetection, fillerDetection });
  const historyRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    latestRef.current = { transcript, showTranscript, silenceDetection, fillerDetection };
  });

  function recordHistory() {
    historyRef.current.push({ ...latestRef.current });
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }

  function handleUndo() {
    if (!historyRef.current.length) return;
    futureRef.current.unshift({ ...latestRef.current });
    const prev = historyRef.current.pop()!;
    setTranscript(prev.transcript);
    setShowTranscript(prev.showTranscript);
    setSilenceDetection(prev.silenceDetection);
    setFillerDetection(prev.fillerDetection);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
  }

  function handleRedo() {
    if (!futureRef.current.length) return;
    historyRef.current.push({ ...latestRef.current });
    const next = futureRef.current.shift()!;
    setTranscript(next.transcript);
    setShowTranscript(next.showTranscript);
    setSilenceDetection(next.silenceDetection);
    setFillerDetection(next.fillerDetection);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  }

  // ── Query ──────────────────────────────────────────────────────────────────
  const { data: videos, isLoading, isError, error } = useQuery({
    queryKey: ["videos"],
    queryFn: getVideos,
  });

  const selectedVideo = videos?.find((v) => v.id === selectedId) ?? null;

  // ── Reset when clip changes ────────────────────────────────────────────────
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setProcessedUrl(null);
    setTranscript(null);
    setShowTranscript(false);
    setSilenceDetection(null);
    setFillerDetection(null);
    setTranscriptProgress(0);
    setTranscribeError(null);
    setSilenceError(null);
    setFillerError(null);
    setExportError(null);
    setAssistantError(null);
    setConfirmDelete(false);
    historyRef.current = [];
    futureRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, [selectedId]);

  // ── Load existing data for selected ready clip ─────────────────────────────
  useEffect(() => {
    if (!selectedVideo || selectedVideo.status !== "ready") return;
    getTranscript(selectedVideo.id).then(setTranscript).catch(() => {});
    getSilence(selectedVideo.id).then(setSilenceDetection).catch(() => {});
    getFillers(selectedVideo.id).then(setFillerDetection).catch(() => {});
  }, [selectedVideo?.id, selectedVideo?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── WebSocket for transcription progress ───────────────────────────────────
  useEffect(() => {
    if (!selectedVideo || selectedVideo.status !== "processing") return;
    const ws = createTranscriptionSocket(selectedVideo.id);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string) as { status: string; progress?: number; detail?: string };
      if (data.status === "processing") {
        setTranscriptProgress(data.progress ?? 0);
      } else if (data.status === "completed") {
        ws.close();
        setShowTranscript(true);
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else if (data.status === "error") {
        setTranscribeError(data.detail ?? "Transcription failed");
        ws.close();
      }
    };
    ws.onerror = () => setTranscribeError("WebSocket connection error");
    return () => ws.close();
  }, [selectedVideo?.status, selectedVideo?.id, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ──────────────────────────────────────────────────────────────
  const transcribeMutation = useMutation({
    mutationFn: () => transcribeVideo(selectedId!),
    onSuccess: () => { setTranscribeError(null); queryClient.invalidateQueries({ queryKey: ["videos"] }); },
    onError: (err: Error) => setTranscribeError(err.message),
  });

  const subtitleMutation = useMutation({
    mutationFn: () => generateSubtitles(selectedId!),
    onSuccess: () => {
      recordHistory();
      getTranscript(selectedId!).then(setTranscript).catch(() => {});
    },
    onError: (err: Error) => setTranscribeError(err.message),
  });

  const detectSilenceMutation = useMutation({
    mutationFn: () => detectSilence(selectedId!),
    onSuccess: () => {
      recordHistory(); setSilenceError(null);
      getSilence(selectedId!).then(setSilenceDetection).catch(() => {});
    },
    onError: (err: Error) => setSilenceError(err.message),
  });

  const removeSilenceMutation = useMutation({
    mutationFn: () => removeSilence(selectedId!),
    onSuccess: () => {
      recordHistory(); setSilenceError(null);
      setSilenceDetection((prev) => (prev ? { ...prev, segments: [] } : null));
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (err: Error) => setSilenceError(err.message),
  });

  const detectFillersMutation = useMutation({
    mutationFn: () => detectFillers(selectedId!),
    onSuccess: () => {
      recordHistory(); setFillerError(null);
      getFillers(selectedId!).then(setFillerDetection).catch(() => {});
    },
    onError: (err: Error) => setFillerError(err.message),
  });

  const removeFillersMutation = useMutation({
    mutationFn: () => removeFillers(selectedId!),
    onSuccess: () => {
      recordHistory(); setFillerError(null);
      setFillerDetection((prev) => (prev ? { ...prev, segments: [] } : null));
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (err: Error) => setFillerError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteVideo(selectedId!),
    onSuccess: () => {
      setSelectedId(null);
      setConfirmDelete(false);
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: () => setConfirmDelete(false),
  });

  // ── Seek handler (updates both state and video element) ────────────────────
  function handleSeek(t: number) {
    setCurrentTime(t);
    seekFnRef.current?.(t);
  }

  // ── Processed URL from AI execution ───────────────────────────────────────
  function handleExecuted(path: string) {
    const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
    const url = path.startsWith("http") ? path : `${BASE}${path}`;
    setProcessedUrl(url);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col bg-studio-bg text-studio-text font-sans overflow-hidden"
      style={{ height: "100vh", maxHeight: "100vh" }}
    >
      {/* Top menu bar */}
      <MenuBar selectedVideo={selectedVideo} mode={mode} onModeChange={setMode} />

      {/* Main panel row */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left: Media bin */}
        <div
          className="shrink-0 border-r border-studio-neutral/15 bg-studio-surface overflow-hidden flex flex-col"
          style={{ width: 220 }}
        >
          <MediaBin
            videos={videos ?? []}
            selectedId={selectedId}
            onSelect={setSelectedId}
            isLoading={isLoading}
          />
        </div>

        {/* Center: Monitors + Timeline */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Dual monitors */}
          <div
            className="border-b border-studio-neutral/15 shrink-0 overflow-hidden"
            style={{ height: "44%" }}
          >
            {isError ? (
              <div className="flex items-center justify-center h-full bg-[#080808]">
                <div className="text-center px-6">
                  <p className="text-sm text-red-400 mb-1 font-medium">Backend offline</p>
                  <p className="text-[10px] text-studio-neutral mb-2">
                    {error instanceof Error ? error.message : "Cannot connect to server."}
                  </p>
                  <p className="text-[10px] text-studio-neutral/50 font-mono">
                    uvicorn app.main:app --reload
                  </p>
                </div>
              </div>
            ) : (
              <DualMonitor
                video={selectedVideo}
                processedUrl={processedUrl}
                currentTime={currentTime}
                duration={duration}
                isPlaying={isPlaying}
                onTimeUpdate={setCurrentTime}
                onDurationChange={setDuration}
                onPlayToggle={() => setIsPlaying((p) => !p)}
                seekFnRef={seekFnRef}
              />
            )}
          </div>

          {/* Timeline (takes remaining height) */}
          <div className="flex-1 overflow-hidden min-h-0">
            <Timeline
              video={selectedVideo}
              silenceDetection={silenceDetection}
              fillerDetection={fillerDetection}
              currentTime={currentTime}
              duration={duration}
              onSeek={handleSeek}
              activeTool={activeTool}
              onToolChange={setActiveTool}
            />
          </div>
        </div>

        {/* Right: Inspector */}
        <div
          className="shrink-0 border-l border-studio-neutral/15 bg-studio-surface overflow-hidden flex flex-col"
          style={{ width: 280 }}
        >
          <InspectorPanel
            video={selectedVideo}
            tab={inspectorTab}
            onTabChange={setInspectorTab}
            mode={mode}
            transcript={transcript}
            isTranscribing={transcribeMutation.isPending}
            transcriptProgress={transcriptProgress}
            transcribeError={transcribeError}
            showTranscript={showTranscript}
            onTranscribe={() => transcribeMutation.mutate()}
            onToggleTranscript={() => setShowTranscript((s) => !s)}
            isGeneratingSubtitles={subtitleMutation.isPending}
            onGenerateSubtitles={() => subtitleMutation.mutate()}
            silenceDetection={silenceDetection}
            isDetectingSilence={detectSilenceMutation.isPending}
            isRemovingSilence={removeSilenceMutation.isPending}
            silenceError={silenceError}
            onDetectSilence={() => detectSilenceMutation.mutate()}
            onRemoveSilence={() => removeSilenceMutation.mutate()}
            fillerDetection={fillerDetection}
            isDetectingFillers={detectFillersMutation.isPending}
            isRemovingFillers={removeFillersMutation.isPending}
            fillerError={fillerError}
            onDetectFillers={() => detectFillersMutation.mutate()}
            onRemoveFillers={() => removeFillersMutation.mutate()}
            onExportError={(msg) => setExportError(msg || null)}
            onAssistantError={(msg) => setAssistantError(msg || null)}
            onExecuted={handleExecuted}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onDelete={() => deleteMutation.mutate()}
            isDeleting={deleteMutation.isPending}
            confirmDelete={confirmDelete}
            onConfirmDelete={() => setConfirmDelete((s) => !s)}
          />
        </div>
      </div>

      {/* Bottom status bar */}
      <StatusBar
        video={selectedVideo}
        currentTime={currentTime}
        activeTool={activeTool}
        isPlaying={isPlaying}
      />

      {/* Suppress unused error vars from lint */}
      {(exportError || assistantError) && null}
    </div>
  );
}
