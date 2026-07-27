import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTranscriptionSocket,
  deleteVideo,
  detectFillers,
  detectSilence,
  generateSubtitles,
  getExportStreamUrl,
  getFillerExportStreamUrl,
  getFillers,
  getSilence,
  getStreamUrl,
  getSubtitleVttUrl,
  getTranscript,
  removeFillers,
  removeSilence,
  transcribeVideo,
} from "@/api/client";
import type { FillerDetection, SilenceDetection, Transcript, Video } from "@/types";
import ProgressBar from "@/components/common/ProgressBar";
import AssistantPanel from "@/components/library/AssistantPanel";
import ExportPanel from "@/components/library/ExportPanel";
import FillerPanel from "@/components/library/FillerPanel";
import SilencePanel from "@/components/library/SilencePanel";
import TranscriptPanel from "@/components/library/TranscriptPanel";

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

export function formatSize(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface VideoCardProps {
  video: Video;
  mode?: "manual" | "ai";
  isActive: boolean;
  onPreviewToggle: () => void;
  onDeleted: () => void;
}

export default function VideoCard({ video, mode = "manual", isActive, onPreviewToggle, onDeleted }: VideoCardProps) {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [transcriptProgress, setTranscriptProgress] = useState(0);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [ccEnabled, setCcEnabled] = useState(false);
  const [silenceError, setSilenceError] = useState<string | null>(null);
  const [fillerError, setFillerError] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [silenceDetection, setSilenceDetection] = useState<SilenceDetection | null>(null);
  const [fillerDetection, setFillerDetection] = useState<FillerDetection | null>(null);

  type Snapshot = { transcript: Transcript | null; showTranscript: boolean; silenceDetection: SilenceDetection | null; fillerDetection: FillerDetection | null };
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
    if (historyRef.current.length === 0) return;
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
    if (futureRef.current.length === 0) return;
    historyRef.current.push({ ...latestRef.current });
    const next = futureRef.current.shift()!;
    setTranscript(next.transcript);
    setShowTranscript(next.showTranscript);
    setSilenceDetection(next.silenceDetection);
    setFillerDetection(next.fillerDetection);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteVideo(video.id),
    onSuccess: () => { onDeleted(); setConfirmDelete(false); },
    onError: (err: Error) => { setDeleteError(err.message); setConfirmDelete(false); },
  });

  const transcribeMutation = useMutation({
    mutationFn: () => transcribeVideo(video.id),
    onSuccess: () => { setTranscribeError(null); queryClient.invalidateQueries({ queryKey: ["videos"] }); },
    onError: (err: Error) => { setTranscribeError(err.message); },
  });

  const subtitleMutation = useMutation({
    mutationFn: () => generateSubtitles(video.id),
    onSuccess: () => { recordHistory(); setSubtitleError(null); getTranscript(video.id).then(setTranscript).catch(() => {}); },
    onError: (err: Error) => { setSubtitleError(err.message); },
  });

  const detectMutation = useMutation({
    mutationFn: () => detectSilence(video.id),
    onSuccess: () => { recordHistory(); setSilenceError(null); getSilence(video.id).then(setSilenceDetection).catch(() => {}); },
    onError: (err: Error) => { setSilenceError(err.message); },
  });

  const removeMutation = useMutation({
    mutationFn: () => removeSilence(video.id),
    onSuccess: () => {
      recordHistory(); setSilenceError(null);
      setSilenceDetection((prev) => (prev ? { ...prev, segments: [] } : null));
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (err: Error) => { setSilenceError(err.message); },
  });

  const detectFillerMutation = useMutation({
    mutationFn: () => detectFillers(video.id),
    onSuccess: () => { recordHistory(); setFillerError(null); getFillers(video.id).then(setFillerDetection).catch(() => {}); },
    onError: (err: Error) => { setFillerError(err.message); },
  });

  const removeFillerMutation = useMutation({
    mutationFn: () => removeFillers(video.id),
    onSuccess: () => {
      recordHistory(); setFillerError(null);
      setFillerDetection((prev) => (prev ? { ...prev, segments: [] } : null));
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (err: Error) => { setFillerError(err.message); },
  });

  useEffect(() => { if (isActive) setCcEnabled(false); }, [isActive]);

  useEffect(() => {
    if (video.status !== "processing") return;
    const ws = createTranscriptionSocket(video.id);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string);
      if (data.status === "processing") {
        setTranscriptProgress(data.progress as number);
      } else if (data.status === "completed") {
        ws.close(); setShowTranscript(true);
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else if (data.status === "error") {
        setTranscribeError((data.detail as string) ?? "Transcription failed");
        ws.close();
      }
    };
    ws.onerror = () => { setTranscribeError("WebSocket connection error"); };
    return () => ws.close();
  }, [video.status, video.id, queryClient]);

  useEffect(() => {
    if (video.status !== "ready" || transcript !== null) return;
    getTranscript(video.id).then(setTranscript).catch(() => {});
  }, [video.status, video.id, transcript]);

  useEffect(() => {
    if (video.status !== "ready" || silenceDetection !== null) return;
    getSilence(video.id).then(setSilenceDetection).catch(() => {});
  }, [video.status, video.id, silenceDetection]);

  useEffect(() => {
    if (video.status !== "ready" || fillerDetection !== null) return;
    getFillers(video.id).then(setFillerDetection).catch(() => {});
  }, [video.status, video.id, fillerDetection]);

  function toggleCC() {
    if (!videoRef.current) return;
    const track = videoRef.current.textTracks[0];
    if (!track) return;
    const next = !ccEnabled;
    track.mode = next ? "showing" : "hidden";
    setCcEnabled(next);
  }

  const hasSubtitles = transcript?.vtt_path != null;
  const showVideo = isActive || mode === "ai";

  const anyError = deleteError || transcribeError || subtitleError || silenceError || fillerError || assistantError;

  return (
    <div
      className="panel p-4 flex flex-col gap-3"
      onMouseLeave={() => setConfirmDelete(false)}
    >
      {/* ── Header: filename + status + export ── */}
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-xs font-medium text-studio-text truncate leading-5"
          title={video.filename}
        >
          {video.filename}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {video.status === "ready" && (
            <ExportPanel
              videoId={video.id}
              onError={(msg) => setAssistantError(msg || null)}
            />
          )}
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              video.status === "ready"
                ? "text-studio-accent border-studio-accent/30 bg-studio-accent/10"
                : "text-studio-neutral border-studio-neutral/20 bg-studio-surface-hover"
            }`}
          >
            {video.status}
          </span>
        </div>
      </div>

      {/* ── Meta grid ── */}
      <div className="grid grid-cols-3 gap-1.5">
        {[
          ["Duration", formatDuration(video.duration)],
          ["Size",     formatSize(video.file_size)],
          ["Date",     new Date(video.created_at).toLocaleDateString()],
        ].map(([label, value]) => (
          <div key={label} className="bg-studio-bg rounded px-2 py-1.5 border border-studio-neutral/10">
            <span className="block text-[9px] text-studio-neutral uppercase tracking-widest mb-0.5">
              {label}
            </span>
            <span className="text-[11px] text-studio-muted font-mono">{value}</span>
          </div>
        ))}
      </div>

      {/* ── Video player ── */}
      {showVideo && (
        <div className="flex flex-col gap-1.5">
          <video
            ref={videoRef}
            controls
            className="w-full rounded"
            src={getStreamUrl(video.id)}
          >
            {hasSubtitles && <track kind="subtitles" src={getSubtitleVttUrl(video.id)} />}
          </video>
          {hasSubtitles && (
            <div className="flex justify-end">
              <button
                onClick={toggleCC}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                  ccEnabled
                    ? "bg-studio-accent text-studio-text"
                    : "bg-studio-surface border border-studio-neutral/20 text-studio-neutral hover:text-studio-muted"
                }`}
              >
                CC
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Manual panels ── */}
      {mode === "manual" && showTranscript && transcript && (
        <TranscriptPanel
          transcript={transcript}
          videoId={video.id}
          onGenerateSubtitles={() => subtitleMutation.mutate()}
          isGenerating={subtitleMutation.isPending}
        />
      )}

      {mode === "manual" && video.status === "ready" && (
        <SilencePanel
          silenceDetection={silenceDetection}
          onDetect={() => detectMutation.mutate()}
          onRemove={() => removeMutation.mutate()}
          isDetecting={detectMutation.isPending}
          isRemoving={removeMutation.isPending}
          exportStreamUrl={video.export_path ? getExportStreamUrl(video.id) : null}
        />
      )}

      {mode === "manual" && video.status === "ready" && (
        <FillerPanel
          fillerDetection={fillerDetection}
          transcript={transcript}
          onDetect={() => detectFillerMutation.mutate()}
          onRemove={() => removeFillerMutation.mutate()}
          isDetecting={detectFillerMutation.isPending}
          isRemoving={removeFillerMutation.isPending}
          exportStreamUrl={video.filler_export_path ? getFillerExportStreamUrl(video.id) : null}
        />
      )}

      {/* ── AI panel ── */}
      {mode === "ai" && video.status === "ready" && (
        <AssistantPanel
          videoId={video.id}
          onError={(msg) => setAssistantError(msg || null)}
        />
      )}

      {/* ── Errors ── */}
      {anyError && (
        <div className="flex flex-col gap-1 pt-1 border-t border-studio-neutral/10">
          {[deleteError, transcribeError, subtitleError, silenceError, fillerError, assistantError]
            .filter(Boolean)
            .map((msg, i) => (
              <p key={i} className="text-[10px] text-red-400">{msg}</p>
            ))}
        </div>
      )}

      {/* ── Action bar ── */}
      <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1 border-t border-studio-neutral/10">
        {video.status === "processing" ? (
          <ProgressBar percent={transcriptProgress} label="Transcribing…" />
        ) : (
          <>
            {/* Undo / Redo */}
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              title="Undo"
              className="px-2 py-1 rounded text-[10px] text-studio-neutral hover:text-studio-muted hover:bg-studio-surface-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ↩
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              title="Redo"
              className="px-2 py-1 rounded text-[10px] text-studio-neutral hover:text-studio-muted hover:bg-studio-surface-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ↪
            </button>

            <div className="w-px h-3 bg-studio-neutral/20 mx-0.5" />

            {mode === "manual" && (
              <button
                onClick={onPreviewToggle}
                className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                  isActive
                    ? "bg-studio-accent/20 text-studio-accent border border-studio-accent/30"
                    : "text-studio-neutral hover:text-studio-muted hover:bg-studio-surface-hover"
                }`}
              >
                {isActive ? "Hide" : "Preview"}
              </button>
            )}

            {mode === "manual" && (
              transcript !== null ? (
                <button
                  onClick={() => setShowTranscript((s) => !s)}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                    showTranscript
                      ? "bg-studio-neutral/20 text-studio-muted border border-studio-neutral/30"
                      : "text-studio-neutral hover:text-studio-muted hover:bg-studio-surface-hover"
                  }`}
                >
                  {showTranscript ? "Hide Transcript" : "Transcript"}
                </button>
              ) : (
                <button
                  onClick={() => transcribeMutation.mutate()}
                  disabled={transcribeMutation.isPending}
                  className="px-2.5 py-1 rounded text-[10px] font-medium bg-studio-accent hover:bg-studio-accent-hover text-studio-text transition-colors disabled:opacity-40"
                >
                  {transcribeMutation.isPending ? "Starting…" : "Transcribe"}
                </button>
              )
            )}

            <div className="ml-auto" />

            {confirmDelete ? (
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-2.5 py-1 rounded text-[10px] font-medium bg-red-900/40 text-red-400 border border-red-900/40 hover:bg-red-900/60 transition-colors disabled:opacity-40"
              >
                {deleteMutation.isPending ? "Deleting…" : "Confirm?"}
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-2.5 py-1 rounded text-[10px] text-studio-neutral hover:text-red-400 hover:bg-studio-surface-hover transition-colors"
              >
                Delete
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
