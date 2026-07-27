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
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <div className="w-7 h-7 bg-violet-500 rounded flex items-center justify-center text-xs font-bold shrink-0">
          AI
        </div>
        <span className="font-semibold tracking-tight text-white">
          AI Video Editor
        </span>

        <nav className="flex items-center gap-1 ml-4">
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                pathname === to
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-900"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <span className="ml-auto text-xs text-gray-500">v1.0.0</span>
      </header>

      <main className="flex-1 p-6">{children}</main>

      <footer className="border-t border-gray-800 px-6 py-3 text-xs text-gray-600 text-center">
        Open-source · Local · Free
      </footer>
    </div>
  );
}
