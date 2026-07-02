import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { PagedPreview } from "../components/PagedPreview";
import type { ResumeDocument } from "../types";

export function PrintPage() {
  const { id = "" } = useParams();
  const [document, setDocument] = useState<ResumeDocument | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    window.__RESUME_READY__ = false;
    api.get(id).then(setDocument).catch((reason: Error) => setError(reason.message));
  }, [id]);

  const ready = useCallback(() => {
    window.__RESUME_READY__ = true;
  }, []);

  if (error) return <div className="print-error">{error}</div>;
  if (!document) return <div className="print-loading">正在准备打印版…</div>;
  return (
    <main className="print-page">
      <PagedPreview document={document} onReady={ready} />
    </main>
  );
}

