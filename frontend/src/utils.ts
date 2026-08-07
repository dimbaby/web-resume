import type { RichTextSpan, TextStyle } from "./types";

export function plain(spans: RichTextSpan[]): string {
  return spans.map((span) => span.text).join("");
}

const DEFAULT_TEXT_STYLE: TextStyle = { bold: false, italic: false };

function appendSpan(spans: RichTextSpan[], text: string, style: TextStyle) {
  if (!text) return;
  const previous = spans.at(-1);
  if (
    previous &&
    Boolean(previous.bold) === style.bold &&
    Boolean(previous.italic) === style.italic
  ) {
    previous.text += text;
    return;
  }
  spans.push({ text, bold: style.bold, italic: style.italic });
}

function decodeMarkdownEscapes(value: string) {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    if (
      value[index] === "\\" &&
      index + 1 < value.length &&
      ["\\", "*"].includes(value[index + 1])
    ) {
      result += value[index + 1];
      index += 1;
    } else {
      result += value[index];
    }
  }
  return result;
}

function isAsciiWord(character: string | undefined) {
  return Boolean(character && /[A-Za-z0-9]/.test(character));
}

function markerAt(source: string, index: number) {
  if (source.startsWith("***", index)) return "***";
  if (source.startsWith("**", index)) return "**";
  return source[index] === "*" ? "*" : "";
}

function findClosingMarker(
  source: string,
  marker: string,
  contentStart: number,
) {
  for (
    let index = contentStart;
    index <= source.length - marker.length;
    index += 1
  ) {
    if (source[index] === "\n" || source[index] === "\r") return -1;
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (!source.startsWith(marker, index)) continue;
    const content = source.slice(contentStart, index);
    if (!content || /^\s|\s$/.test(content)) continue;
    if (marker === "*" && isAsciiWord(source[index + marker.length])) {
      continue;
    }
    return index;
  }
  return -1;
}

/** Parse the deliberately small Markdown subset supported by resume fields. */
export function parseInlineMarkdown(
  source: string,
  inheritedStyle: TextStyle = DEFAULT_TEXT_STYLE,
): RichTextSpan[] {
  const spans: RichTextSpan[] = [];
  let plainBuffer = "";

  const flushPlain = () => {
    appendSpan(spans, plainBuffer, inheritedStyle);
    plainBuffer = "";
  };

  for (let index = 0; index < source.length; ) {
    if (
      source[index] === "\\" &&
      index + 1 < source.length &&
      ["\\", "*"].includes(source[index + 1])
    ) {
      plainBuffer += source[index + 1];
      index += 2;
      continue;
    }

    const marker = markerAt(source, index);

    const singleMarkerCanOpen =
      marker !== "*" || !isAsciiWord(source[index - 1]);
    const nextCharacter = source[index + marker.length];
    if (
      marker &&
      singleMarkerCanOpen &&
      nextCharacter &&
      !/\s/.test(nextCharacter)
    ) {
      const closingIndex = findClosingMarker(
        source,
        marker,
        index + marker.length,
      );
      if (closingIndex >= 0) {
        flushPlain();
        appendSpan(
          spans,
          decodeMarkdownEscapes(
            source.slice(index + marker.length, closingIndex),
          ),
          {
            bold: inheritedStyle.bold || marker.length >= 2,
            italic:
              inheritedStyle.italic || marker.length === 1 || marker.length === 3,
          },
        );
        index = closingIndex + marker.length;
        continue;
      }
    }

    if (marker.length > 1) {
      plainBuffer += marker;
      index += marker.length;
      continue;
    }

    plainBuffer += source[index];
    index += 1;
  }

  flushPlain();
  return spans;
}

function escapeMarkdownText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("*", "\\*");
}

function escapeLiteralMarkdown(value: string) {
  let result = "";
  for (let index = 0; index < value.length; ) {
    if (value[index] === "\\") {
      result += "\\\\";
      index += 1;
      continue;
    }

    const marker = markerAt(value, index);
    const singleMarkerCanOpen =
      marker !== "*" || !isAsciiWord(value[index - 1]);
    const nextCharacter = value[index + marker.length];
    if (
      marker &&
      singleMarkerCanOpen &&
      nextCharacter &&
      !/\s/.test(nextCharacter)
    ) {
      const closingIndex = findClosingMarker(
        value,
        marker,
        index + marker.length,
      );
      if (closingIndex >= 0) {
        const escapedMarker = marker.replaceAll("*", "\\*");
        result += escapedMarker;
        result += escapeLiteralMarkdown(
          value.slice(index + marker.length, closingIndex),
        );
        result += escapedMarker;
        index = closingIndex + marker.length;
        continue;
      }
    }

    if (marker.length > 1) {
      result += marker;
      index += marker.length;
      continue;
    }
    result += value[index];
    index += 1;
  }
  return result;
}

/** Convert structured spans back to editable inline Markdown without losing spaces. */
export function inlineMarkdownSource(
  spans: RichTextSpan[],
  inheritedStyle: TextStyle = DEFAULT_TEXT_STYLE,
) {
  return spans
    .map((span) => {
      const bold = Boolean(span.bold) && !inheritedStyle.bold;
      const italic = Boolean(span.italic) && !inheritedStyle.italic;
      if (!bold && !italic) {
        return escapeLiteralMarkdown(span.text);
      }
      const marker = bold && italic ? "***" : bold ? "**" : "*";
      return `${marker}${escapeMarkdownText(span.text)}${marker}`;
    })
    .join("");
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
