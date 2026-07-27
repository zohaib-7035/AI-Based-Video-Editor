import { useRef, useState } from "react";

const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm"]);
const ALLOWED_LABEL = ".mp4, .mov, .avi, .mkv, .webm";

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UploadZoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export default function UploadZone({ onFile, disabled = false }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const ext = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      setValidationError(`"${file.name}" is not supported. Accepted: ${ALLOWED_LABEL}`);
      setSelectedFile(null);
      return;
    }
    setValidationError(null);
    setSelectedFile(file);
    onFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }

  function handleDragLeave() { setIsDragging(false); }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  const borderCls = isDragging
    ? "border-studio-accent bg-studio-accent/5"
    : validationError
    ? "border-red-600/60"
    : "border-studio-neutral/20 hover:border-studio-neutral/40";

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${borderCls} ${
          disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Drop a video file here or click to browse"
        onKeyDown={(e) => e.key === "Enter" && !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={[...ALLOWED_EXTENSIONS].join(",")}
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled}
          aria-hidden
        />

        {selectedFile ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-studio-text">{selectedFile.name}</p>
            <p className="text-xs text-studio-neutral font-mono">{formatBytes(selectedFile.size)}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="w-10 h-10 bg-studio-surface border border-studio-neutral/20 rounded-lg flex items-center justify-center mx-auto mb-3">
              <span className="text-xl">↑</span>
            </div>
            <p className="text-sm text-studio-muted">
              Drag a video here, or{" "}
              <span className="text-studio-accent">browse</span>
            </p>
            <p className="text-[10px] text-studio-neutral font-mono">{ALLOWED_LABEL}</p>
          </div>
        )}
      </div>

      {validationError && (
        <p className="text-xs text-red-400">{validationError}</p>
      )}
    </div>
  );
}
