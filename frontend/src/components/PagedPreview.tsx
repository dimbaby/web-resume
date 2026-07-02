import { useEffect, useRef, useState } from "react";
import { Previewer } from "pagedjs";
import type { ResumeDocument } from "../types";
import { ResumePreview } from "./ResumePreview";

type Props = {
  document: ResumeDocument;
  onPageCount?: (count: number) => void;
  onReady?: () => void;
};

export function PagedPreview({ document, onPageCount, onReady }: Props) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const runRef = useRef(0);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    const run = ++runRef.current;
    const timer = window.setTimeout(async () => {
      if (!sourceRef.current || !targetRef.current) return;
      setRendering(true);
      const stagedTarget = window.document.createElement("div");
      Object.assign(stagedTarget.style, {
        position: "fixed",
        left: "-100000px",
        top: "0",
        width: "794px",
        visibility: "hidden",
        pointerEvents: "none",
      });
      window.document.body.appendChild(stagedTarget);
      try {
        const previewer = new Previewer();
        const flow = await previewer.preview(
          sourceRef.current.innerHTML,
          ["/print.css"],
          stagedTarget,
        );
        if (run !== runRef.current) return;
        targetRef.current.replaceChildren(...stagedTarget.childNodes);
        onPageCount?.(flow.total);
        onReady?.();
      } finally {
        stagedTarget.remove();
        if (run === runRef.current) setRendering(false);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [document, onPageCount, onReady]);

  return (
    <div className="paged-preview">
      <div className="paged-source" ref={sourceRef} aria-hidden="true">
        <ResumePreview document={document} />
      </div>
      {rendering && <div className="preview-loading">正在重新排版…</div>}
      <div className="paged-target" ref={targetRef} />
    </div>
  );
}
