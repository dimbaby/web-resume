import type {
  LibraryEntry,
  ResumeBullet,
  ResumeDocument,
  ResumeItem,
} from "./types";
import { uid } from "./utils";

function cloneSpans<T extends { text: string; bold?: boolean; italic?: boolean }>(
  spans: T[],
) {
  return spans.map((span) => ({ ...span }));
}

export function cloneLibraryBullet(bullet: ResumeBullet): ResumeBullet {
  return {
    id: uid(),
    content: cloneSpans(bullet.content),
  };
}

export function cloneLibraryItem(item: ResumeItem): ResumeItem {
  return {
    id: uid(),
    title: cloneSpans(item.title),
    subtitle: cloneSpans(item.subtitle),
    title_style: { ...item.title_style },
    subtitle_style: { ...item.subtitle_style },
    date: item.date,
    bullets: item.bullets.map(cloneLibraryBullet),
  };
}

function richTextFingerprint(
  spans: Array<{ text: string; bold?: boolean; italic?: boolean }>,
) {
  return spans.map((span) => [span.text, Boolean(span.bold), Boolean(span.italic)]);
}

export function bulletFingerprint(bullet: ResumeBullet) {
  return JSON.stringify(richTextFingerprint(bullet.content));
}

export function itemFingerprint(item: ResumeItem) {
  return JSON.stringify({
    title: richTextFingerprint(item.title),
    subtitle: richTextFingerprint(item.subtitle),
    title_style: item.title_style,
    subtitle_style: item.subtitle_style,
    date: item.date,
    bullets: item.bullets.map(bulletFingerprint),
  });
}

export function appendLibraryItem(
  document: ResumeDocument,
  sectionId: string,
  entry: LibraryEntry,
): { document: ResumeDocument; added: boolean } {
  const section = document.sections.find((value) => value.id === sectionId);
  if (!section) return { document, added: false };
  const fingerprint = itemFingerprint(entry.item);
  if (section.items.some((item) => itemFingerprint(item) === fingerprint)) {
    return { document, added: false };
  }
  const item = cloneLibraryItem(entry.item);
  return {
    added: true,
    document: {
      ...document,
      sections: document.sections.map((value) =>
        value.id === sectionId ? { ...value, items: [...value.items, item] } : value,
      ),
    },
  };
}

export function appendLibraryBullet(
  document: ResumeDocument,
  sectionId: string,
  itemId: string,
  bullet: ResumeBullet,
): { document: ResumeDocument; added: boolean } {
  const item = document.sections
    .find((section) => section.id === sectionId)
    ?.items.find((value) => value.id === itemId);
  if (!item) return { document, added: false };
  const fingerprint = bulletFingerprint(bullet);
  if (item.bullets.some((value) => bulletFingerprint(value) === fingerprint)) {
    return { document, added: false };
  }
  const clonedBullet = cloneLibraryBullet(bullet);
  return {
    added: true,
    document: {
      ...document,
      sections: document.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map((value) =>
                value.id === itemId
                  ? { ...value, bullets: [...value.bullets, clonedBullet] }
                  : value,
              ),
            }
          : section,
      ),
    },
  };
}
