import type { RichTextSpan, TextStyle } from "./types";

export function plain(spans: RichTextSpan[]): string {
  return spans.map((span) => span.text).join("");
}

export function rich(text: string, style?: Partial<TextStyle>): RichTextSpan[] {
  return text
    ? [
        {
          text,
          bold: style?.bold ?? false,
          italic: style?.italic ?? false,
        },
      ]
    : [];
}

export function styleRichText(
  spans: RichTextSpan[],
  style: TextStyle,
): RichTextSpan[] {
  return spans.map((span) => ({ ...span, bold: style.bold, italic: style.italic }));
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
