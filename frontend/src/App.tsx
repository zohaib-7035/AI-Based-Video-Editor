import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import Layout from "@/components/common/Layout";
import HomePage from "@/pages/HomePage";
import Dashboard from "@/pages/Dashboard";
import UploadPage from "@/pages/UploadPage";
import LibraryPage from "@/pages/LibraryPage";

function LayoutShell() {
  return <Layout><Outlet /></Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* NLE editor gets full screen — no Layout wrapper */}
        <Route path="/library" element={<LibraryPage />} />
        <Route element={<LayoutShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/upload" element={<UploadPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
