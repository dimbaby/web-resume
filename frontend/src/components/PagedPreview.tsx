import { useEffect, useRef, useState } from "react";
import { Previewer } from "pagedjs";
import type { ResumeDocument } from "../types";
import { ResumePreview } from "./ResumePreview";

type Props = {
  document: ResumeDocument;
  onPageCount?: (count: number) => void;
  onReady?: () => void;
};

async function waitForImages(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete && image.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => {
            image.removeEventListener("load", done);
            image.removeEventListener("error", done);
            resolve();
          };
          image.addEventListener("load", done, { once: true });
          image.addEventListener("error", done, { once: true });
        }).then(async () => {
          if ("decode" in image && image.naturalWidth > 0) {
            await image.decode().catch(() => undefined);
          }
        }),
    ),
  );
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

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
        await waitForImages(targetRef.current);
        if (run !== runRef.current) return;
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
