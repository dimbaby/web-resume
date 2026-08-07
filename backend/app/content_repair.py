from __future__ import annotations

import re

from .schemas import ResumeDocument, ResumeItem


_STANDALONE_YEAR = re.compile(r"^(?:19|20)\d{2}$")


def _plain_title(item: ResumeItem) -> str:
    return "".join(span.text for span in item.title).strip()


def _is_italic_title(item: ResumeItem) -> bool:
    visible = [span for span in item.title if span.text.strip()]
    return bool(visible) and all(span.italic for span in visible)


def _looks_like_legacy_heading(item: ResumeItem) -> bool:
    return bool(
        _plain_title(item)
        and any(span.bold for span in item.title if span.text.strip())
        and item.date.strip()
        and not _STANDALONE_YEAR.fullmatch(item.date.strip())
        and not item.subtitle
        and not item.bullets
    )


def _looks_like_year_ending_subtitle(item: ResumeItem) -> bool:
    return bool(
        _plain_title(item)
        and _is_italic_title(item)
        and _STANDALONE_YEAR.fullmatch(item.date.strip())
        and not item.subtitle
        and item.bullets
    )


def repair_legacy_split_items(
    items: list[ResumeItem],
) -> tuple[list[ResumeItem], int]:
    """Merge items created by the old italic-subtitle/year parser bug.

    The old parser interpreted an italic line such as
    ``*Company | Submitted to AAAI 2027*`` as a new item because of the
    trailing year. The malformed pair has a very narrow signature: a heading
    with a real date and no bullets, immediately followed by an all-italic
    item whose date is only a year and which owns the bullets.
    """

    repaired: list[ResumeItem] = []
    repairs = 0
    index = 0
    while index < len(items):
        heading = items[index]
        subtitle = items[index + 1] if index + 1 < len(items) else None
        if (
            subtitle is not None
            and _looks_like_legacy_heading(heading)
            and _looks_like_year_ending_subtitle(subtitle)
        ):
            merged = heading.model_copy(deep=True)
            merged.subtitle = [span.model_copy(deep=True) for span in subtitle.title]
            year = subtitle.date.strip()
            if merged.subtitle:
                separator = "" if merged.subtitle[-1].text.endswith(" ") else " "
                merged.subtitle[-1].text += f"{separator}{year}"
            merged.bullets = [bullet.model_copy(deep=True) for bullet in subtitle.bullets]
            repaired.append(merged)
            repairs += 1
            index += 2
            continue
        repaired.append(heading)
        index += 1
    return repaired, repairs


def repair_legacy_split_document(
    document: ResumeDocument,
) -> tuple[ResumeDocument, int]:
    repaired_document = document.model_copy(deep=True)
    total = 0
    for section in repaired_document.sections:
        section.items, repairs = repair_legacy_split_items(section.items)
        total += repairs
    return (repaired_document if total else document), total
