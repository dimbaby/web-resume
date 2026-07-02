import type { RichTextSpan } from "./types";

export function plain(spans: RichTextSpan[]): string {
  return spans.map((span) => span.text).join("");
}

export function rich(text: string): RichTextSpan[] {
  return text ? [{ text }] : [];
}

export function uid(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

