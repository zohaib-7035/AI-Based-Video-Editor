import { Link } from "react-router-dom";
import type { Video } from "@/types";

const MENUS = ["File", "Edit", "Clip", "Sequence", "Effects", "Window", "Help"];

interface MenuBarProps {
  selectedVideo: Video | null;
  mode: "manual" | "ai";
  onModeChange: (mode: "manual" | "ai") => void;
}

export default function MenuBar({ selectedVideo, mode, onModeChange }: MenuBarProps) {
  return (
    <header className="flex items-center h-8 bg-studio-surface border-b border-studio-neutral/15 shrink-0 select-none overflow-hidden">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 h-full border-r border-studio-neutral/15 shrink-0">
        <div className="w-5 h-5 bg-studio-accent rounded flex items-center justify-center shrink-0">
          <span className="text-[9px] font-bold text-studio-text leading-none">AI</span>
        </div>
        <span className="text-[11px] font-semibold text-studio-text whitespace-nowrap">
          AI Video Editor
        </span>
      </div>

      {/* Menu bar items */}
      <div className="flex items-center h-full border-r border-studio-neutral/15">
        {MENUS.map((menu) => (
          <button
            key={menu}
            className="px-3 h-full text-[11px] text-studio-neutral hover:text-studio-text hover:bg-studio-surface-hover transition-colors whitespace-nowrap"
          >
            {menu}
          </button>
        ))}
      </div>

      {/* Center: active clip name */}
      <div className="flex-1 flex items-center justify-center px-4 min-w-0">
        {selectedVideo ? (
          <span className="text-[10px] text-studio-neutral font-mono truncate max-w-xs">
            {selectedVideo.filename}
          </span>
        ) : (
          <span className="text-[10px] text-studio-neutral/30 italic">No clip selected</span>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1.5 px-3 h-full border-l border-studio-neutral/15 shrink-0">
        {/* Mode toggle */}
        <div className="flex rounded overflow-hidden border border-studio-neutral/20 text-[10px] font-medium">
          <button
            onClick={() => onModeChange("manual")}
            className={`px-2.5 h-5 transition-colors ${
              mode === "manual"
                ? "bg-studio-neutral text-studio-text"
                : "text-studio-neutral hover:bg-studio-surface-hover"
            }`}
          >
            Manual
          </button>
          <button
            onClick={() => onModeChange("ai")}
            className={`px-2.5 h-5 transition-colors ${
              mode === "ai"
                ? "bg-studio-accent text-studio-text"
                : "text-studio-neutral hover:bg-studio-surface-hover"
            }`}
          >
            AI
          </button>
        </div>

        <div className="w-px h-3.5 bg-studio-neutral/20 mx-0.5" />

        <Link
          to="/"
          className="px-2 h-5 flex items-center rounded text-[10px] text-studio-neutral hover:text-studio-muted hover:bg-studio-surface-hover transition-colors"
        >
          Home
        </Link>
        <Link
          to="/dashboard"
          className="px-2 h-5 flex items-center rounded text-[10px] text-studio-neutral hover:text-studio-muted hover:bg-studio-surface-hover transition-colors"
        >
          Status
        </Link>
        <Link
          to="/upload"
          className="px-2.5 h-5 flex items-center rounded text-[10px] font-medium bg-studio-accent hover:bg-studio-accent-hover text-studio-text transition-colors"
        >
          Import
        </Link>
      </div>
    </header>
  );
}
