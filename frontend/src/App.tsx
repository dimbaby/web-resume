import { BrowserRouter, Route, Routes } from "react-router-dom";
import { EditorPage } from "./pages/EditorPage";
import { HomePage } from "./pages/HomePage";
import { ImportReviewPage } from "./pages/ImportReviewPage";
import { PrintPage } from "./pages/PrintPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/import/:id" element={<ImportReviewPage />} />
        <Route path="/edit/:id" element={<EditorPage />} />
        <Route path="/print/:id" element={<PrintPage />} />
      </Routes>
    </BrowserRouter>
  );
}
