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
      setValidationError(
        `"${file.name}" is not a supported format. Accepted: ${ALLOWED_LABEL}`
      );
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

  function handleDragLeave() {
    setIsDragging(false);
  }

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

  const borderColor = isDragging
    ? "border-violet-500"
    : validationError
    ? "border-red-600"
    : "border-gray-700";

  return (
    <div className="space-y-3">
      <div
        className={`border-2 border-dashed ${borderColor} rounded-xl p-10 text-center transition-colors ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-gray-500"
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
          <div className="space-y-1">
            <p className="text-white font-medium">{selectedFile.name}</p>
            <p className="text-gray-400 text-sm">{formatBytes(selectedFile.size)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-gray-300 text-sm">
              Drag and drop a video here, or{" "}
              <span className="text-violet-400 underline">browse</span>
            </p>
            <p className="text-gray-600 text-xs">{ALLOWED_LABEL}</p>
          </div>
        )}
      </div>

      {validationError && (
        <p className="text-red-400 text-sm">{validationError}</p>
      )}
    </div>
  );
}
