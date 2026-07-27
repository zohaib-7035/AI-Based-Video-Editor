import {
  getExportStreamUrl,
  getFillerExportStreamUrl,
} from "@/api/client";
import ProgressBar from "@/components/common/ProgressBar";
import AssistantPanel from "@/components/library/AssistantPanel";
import ExportPanel from "@/components/library/ExportPanel";
import FillerPanel from "@/components/library/FillerPanel";
import SilencePanel from "@/components/library/SilencePanel";
import TranscriptPanel from "@/components/library/TranscriptPanel";
import { formatDuration, formatSize } from "@/components/library/VideoCard";
import type { FillerDetection, SilenceDetection, Transcript, Video } from "@/types";

type Tab = "inspector" | "effects" | "ai" | "export";

interface InspectorPanelProps {
  video: Video | null;
  tab: Tab;
  onTabChange: (t: Tab) => void;
  mode: "manual" | "ai";
  transcript: Transcript | null;
  isTranscribing: boolean;
  transcriptProgress: number;
  transcribeError: string | null;
  showTranscript: boolean;
  onTranscribe: () => void;
  onToggleTranscript: () => void;
  isGeneratingSubtitles: boolean;
  onGenerateSubtitles: () => void;
  silenceDetection: SilenceDetection | null;
  isDetectingSilence: boolean;
  isRemovingSilence: boolean;
  silenceError: string | null;
  onDetectSilence: () => void;
  onRemoveSilence: () => void;
  fillerDetection: FillerDetection | null;
  isDetectingFillers: boolean;
  isRemovingFillers: boolean;
  fillerError: string | null;
  onDetectFillers: () => void;
  onRemoveFillers: () => void;
  onExportError: (msg: string) => void;
  onAssistantError: (msg: string) => void;
  onExecuted: (url: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  confirmDelete: boolean;
  onConfirmDelete: () => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "inspector", label: "Info" },
  { id: "effects",   label: "Effects" },
  { id: "ai",        label: "AI" },
  { id: "export",    label: "Export" },
];

export default function InspectorPanel(props: InspectorPanelProps) {
  const { video, tab, onTabChange } = props;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-studio-neutral/15 bg-studio-surface">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className={`flex-1 h-8 text-[10px] font-medium uppercase tracking-wider transition-colors ${
              tab === t.id
                ? "text-studio-text border-b-2 border-studio-accent"
                : "text-studio-neutral hover:text-studio-muted hover:bg-studio-surface-hover"
            }`}
            style={tab === t.id ? { marginBottom: -1 } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {!video ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="rgba(112,128,144,0.2)" strokeWidth="1.5">
              <rect x="1" y="5" width="30" height="22" rx="2" />
              <path d="M13 11l8 5-8 5V11z" />
            </svg>
            <p className="text-[10px] text-studio-neutral/35">
              Select a clip from the media bin
            </p>
          </div>
        ) : (
          <>
            {tab === "inspector" && <InfoTab video={video} />}
            {tab === "effects" && <EffectsTab {...props} video={video} />}
            {tab === "ai" && (
              <AssistantPanel
                videoId={video.id}
                onError={props.onAssistantError}
                onExecuted={props.onExecuted}
              />
            )}
            {tab === "export" && <ExportTab {...props} video={video} />}
          </>
        )}
      </div>
    </div>
  );
}

function InfoTab({ video }: { video: Video }) {
  const rows: [string, string][] = [
    ["File",       video.filename],
    ["Status",     video.status],
    ["Duration",   formatDuration(video.duration)],
    ["Size",       formatSize(video.file_size)],
    ["Resolution", video.width && video.height ? `${video.width} × ${video.height}` : "—"],
    ["Frame rate", video.fps ? `${video.fps} fps` : "—"],
    ["Codec",      video.codec ?? "—"],
    ["Format",     video.format ?? "—"],
    ["Imported",   new Date(video.created_at).toLocaleString()],
  ];

  return (
    <div>
      <span className="section-label mb-3 block">Clip Properties</span>
      <div className="flex flex-col">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-start gap-2 py-1.5 border-b border-studio-neutral/10"
          >
            <span className="text-[9px] text-studio-neutral uppercase tracking-wider w-16 shrink-0 pt-0.5">
              {label}
            </span>
            <span
              className="text-[10px] text-studio-muted font-mono break-all"
              title={value}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Processed outputs */}
      {(video.export_path || video.filler_export_path) && (
        <div className="mt-4">
          <span className="section-label mb-2 block">Processed Outputs</span>
          <div className="flex flex-col gap-1.5">
            {video.export_path && (
              <div className="flex items-center justify-between bg-studio-bg rounded px-2 py-1.5 border border-studio-neutral/10">
                <span className="text-[9px] text-studio-neutral uppercase tracking-wider">Silence removed</span>
                <span className="text-[9px] text-studio-accent font-mono">Ready</span>
              </div>
            )}
            {video.filler_export_path && (
              <div className="flex items-center justify-between bg-studio-bg rounded px-2 py-1.5 border border-studio-neutral/10">
                <span className="text-[9px] text-studio-neutral uppercase tracking-wider">Fillers removed</span>
                <span className="text-[9px] text-studio-accent font-mono">Ready</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EffectsTab(props: InspectorPanelProps & { video: Video }) {
  const { video } = props;

  return (
    <div className="flex flex-col gap-4">
      {/* Transcription */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="section-label">Transcription</span>
          {video.status === "processing" ? (
            <span className="text-[9px] text-studio-neutral/60 font-mono">Processing…</span>
          ) : props.transcript !== null ? (
            <button
              onClick={props.onToggleTranscript}
              className="text-[10px] text-studio-neutral hover:text-studio-muted transition-colors"
            >
              {props.showTranscript ? "Hide" : "Show"}
            </button>
          ) : (
            <button
              onClick={props.onTranscribe}
              disabled={props.isTranscribing}
              className="btn-secondary"
            >
              {props.isTranscribing ? "Starting…" : "Transcribe"}
            </button>
          )}
        </div>
        {video.status === "processing" && (
          <ProgressBar percent={props.transcriptProgress} label="Transcribing…" />
        )}
        {props.transcribeError && (
          <p className="text-[10px] text-red-400 font-mono">{props.transcribeError}</p>
        )}
        {props.showTranscript && props.transcript && (
          <TranscriptPanel
            transcript={props.transcript}
            videoId={video.id}
            onGenerateSubtitles={props.onGenerateSubtitles}
            isGenerating={props.isGeneratingSubtitles}
          />
        )}
      </div>

      {/* Silence */}
      {video.status === "ready" && (
        <div>
          <SilencePanel
            silenceDetection={props.silenceDetection}
            onDetect={props.onDetectSilence}
            onRemove={props.onRemoveSilence}
            isDetecting={props.isDetectingSilence}
            isRemoving={props.isRemovingSilence}
            exportStreamUrl={video.export_path ? getExportStreamUrl(video.id) : null}
          />
          {props.silenceError && (
            <p className="text-[10px] text-red-400 font-mono mt-1">{props.silenceError}</p>
          )}
        </div>
      )}

      {/* Fillers */}
      {video.status === "ready" && (
        <div>
          <FillerPanel
            fillerDetection={props.fillerDetection}
            transcript={props.transcript}
            onDetect={props.onDetectFillers}
            onRemove={props.onRemoveFillers}
            isDetecting={props.isDetectingFillers}
            isRemoving={props.isRemovingFillers}
            exportStreamUrl={video.filler_export_path ? getFillerExportStreamUrl(video.id) : null}
          />
          {props.fillerError && (
            <p className="text-[10px] text-red-400 font-mono mt-1">{props.fillerError}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ExportTab(props: InspectorPanelProps & { video: Video }) {
  const { video } = props;

  return (
    <div className="flex flex-col gap-5">
      {/* Export */}
      <div>
        <span className="section-label mb-2 block">Export Clip</span>
        <ExportPanel videoId={video.id} onError={props.onExportError} />
      </div>

      {/* History */}
      <div>
        <span className="section-label mb-2 block">History</span>
        <div className="flex gap-2">
          <button
            onClick={props.onUndo}
            disabled={!props.canUndo}
            className="btn-secondary flex items-center gap-1"
          >
            <span>↩</span> Undo
          </button>
          <button
            onClick={props.onRedo}
            disabled={!props.canRedo}
            className="btn-secondary flex items-center gap-1"
          >
            <span>↪</span> Redo
          </button>
        </div>
      </div>

      {/* Delete */}
      <div className="border-t border-studio-neutral/10 pt-4">
        <span className="section-label mb-2 block">Danger Zone</span>
        {props.confirmDelete ? (
          <div className="flex gap-2">
            <button
              onClick={props.onDelete}
              disabled={props.isDeleting}
              className="px-3 py-1.5 rounded text-xs font-medium bg-red-900/30 text-red-400 border border-red-800/40 hover:bg-red-900/50 transition-colors disabled:opacity-40"
            >
              {props.isDeleting ? "Deleting…" : "Confirm Delete"}
            </button>
            <button onClick={props.onConfirmDelete} className="btn-ghost">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={props.onConfirmDelete}
            className="text-[10px] text-studio-neutral hover:text-red-400 transition-colors"
          >
            Delete this clip
          </button>
        )}
      </div>
    </div>
  );
}
