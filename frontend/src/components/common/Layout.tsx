import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

interface LayoutProps {
  children: ReactNode;
}

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/dashboard", label: "Status" },
  { to: "/library", label: "Library" },
  { to: "/upload", label: "Upload" },
];

export default function Layout({ children }: LayoutProps) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-studio-bg text-studio-text flex flex-col font-sans">
      {/* ── Top bar ── */}
      <header className="border-b border-studio-neutral/20 px-6 py-3 flex items-center gap-3 bg-studio-surface shrink-0">
        {/* Logo mark */}
        <div className="w-7 h-7 bg-studio-accent rounded flex items-center justify-center shrink-0">
          <span className="text-[10px] font-semibold text-studio-text tracking-tight">AI</span>
        </div>

        <span className="font-semibold tracking-tight text-studio-text text-sm">
          AI Video Editor
        </span>

        <div className="w-px h-4 bg-studio-neutral/30 mx-1" />

        {/* Navigation */}
        <nav className="flex items-center gap-0.5">
          {NAV_LINKS.map(({ to, label }) => {
            const active = pathname === to || (to !== "/" && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  active
                    ? "bg-studio-bg text-studio-text border border-studio-neutral/20"
                    : "text-studio-neutral hover:text-studio-muted hover:bg-studio-surface-hover"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <span className="ml-auto text-[10px] text-studio-neutral font-mono">v1.0.0</span>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 px-6 py-8">{children}</main>

      {/* ── Footer ── */}
      <footer className="border-t border-studio-neutral/20 px-6 py-3 text-[10px] text-studio-neutral text-center tracking-wide">
        Open-source · Local · Free
      </footer>
    </div>
  );
}
