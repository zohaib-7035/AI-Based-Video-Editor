import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "@/components/common/Layout";
import HomePage from "@/pages/HomePage";
import Dashboard from "@/pages/Dashboard";
import UploadPage from "@/pages/UploadPage";
import LibraryPage from "@/pages/LibraryPage";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/upload" element={<UploadPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
