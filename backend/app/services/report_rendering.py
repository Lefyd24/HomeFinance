"""Markdown report rendering: sanitized email HTML, plain text, and PDF.

Pure Python (markdown-it-py + nh3 + fpdf2) so it works on Windows and the slim
Linux image without GTK/cairo/pango. Raw HTML inside the markdown is disabled
and the result is additionally passed through nh3 as defense in depth.
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

import nh3
from markdown_it import MarkdownIt
from markdown_it.token import Token

_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

_TEXT = "#1f2937"
_MUTED = "#6b7280"
_BORDER = "#d1d5db"
_HEAD_BG = "#f3f4f6"
_PRIMARY = "#056a92"
_MONO = "font-family:Consolas,Menlo,monospace; font-size:12px;"

_STYLES = {
    "h1": f"margin:20px 0 10px; font-size:20px; line-height:1.3; color:{_TEXT};",
    "h2": f"margin:18px 0 8px; font-size:17px; line-height:1.3; color:{_TEXT};",
    "h3": f"margin:16px 0 6px; font-size:15px; line-height:1.3; color:{_TEXT};",
    "h4": f"margin:14px 0 6px; font-size:14px; line-height:1.3; color:{_TEXT};",
    "h5": f"margin:12px 0 4px; font-size:13px; color:{_TEXT};",
    "h6": f"margin:12px 0 4px; font-size:13px; color:{_MUTED};",
    "p": f"margin:0 0 12px; font-size:14px; line-height:1.6; color:{_TEXT};",
    "ul": f"margin:0 0 12px; padding-left:22px; font-size:14px; line-height:1.6; color:{_TEXT};",
    "ol": f"margin:0 0 12px; padding-left:22px; font-size:14px; line-height:1.6; color:{_TEXT};",
    "li": "margin:0 0 4px;",
    "table": f"border-collapse:collapse; width:100%; margin:0 0 16px; font-size:13px; border:1px solid {_BORDER};",
    "th": f"border:1px solid {_BORDER}; padding:6px 8px; background:{_HEAD_BG}; color:{_TEXT}; font-weight:600; text-align:left;",
    "td": f"border:1px solid {_BORDER}; padding:6px 8px; color:{_TEXT};",
    "blockquote": f"margin:0 0 12px; padding:4px 14px; border-left:3px solid {_BORDER}; color:{_MUTED};",
    "code": f"{_MONO} background:#f3f4f6; padding:1px 4px;",
    "pre": f"margin:0 0 12px; padding:10px; background:#f3f4f6; {_MONO} overflow:auto;",
    "hr": f"border:0; border-top:1px solid {_BORDER}; margin:16px 0;",
    "a": f"color:{_PRIMARY};",
}

_ALLOWED_TAGS = {
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "ul", "ol", "li",
    "table", "thead", "tbody", "tr", "th", "td", "strong", "em", "s", "code",
    "pre", "blockquote", "a",
}  # fmt: skip
_ALLOWED_ATTRS = {
    "a": {"href", "style"},
    "th": {"style", "align"},
    "td": {"style", "align"},
    **{t: {"style"} for t in _ALLOWED_TAGS - {"a", "th", "td", "br"}},
}


def _md(inline_styles: bool) -> MarkdownIt:
    md = MarkdownIt("commonmark", {"html": False, "linkify": False}).enable(
        ["table", "strikethrough"]
    )
    if inline_styles:

        def _style_core(state) -> None:
            def walk(tokens: list[Token]) -> None:
                for tok in tokens:
                    # opening tags and self-closing tags (hr, code_inline, fence)
                    if tok.nesting >= 0 and tok.tag in _STYLES:
                        tok.attrSet("style", _STYLES[tok.tag])
                    if tok.children:
                        walk(tok.children)

            walk(state.tokens)

        md.core.ruler.push("inline_styles", _style_core)
    return md


_EMAIL_MD = _md(True)
_PLAIN_MD = _md(False)


def _clean(html: str) -> str:
    return nh3.clean(
        html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRS,
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer nofollow",
        strip_comments=True,
    )


def markdown_to_html(md: str) -> str:
    """Sanitized, email-client-safe HTML fragment (inline styles, no <style>)."""
    return _clean(_EMAIL_MD.render(md or ""))


# --------------------------------------------------------------------- text


def _inline_text(tok: Token) -> str:
    out: list[str] = []
    hrefs: list[str] = []
    link_start: list[int] = []
    for c in tok.children or []:
        if c.type in ("text", "code_inline"):
            out.append(c.content)
        elif c.type in ("softbreak", "hardbreak"):
            out.append("\n")
        elif c.type == "link_open":
            hrefs.append(str(c.attrGet("href") or ""))
            link_start.append(len(out))
        elif c.type == "link_close" and hrefs:
            href = hrefs.pop()
            label = "".join(out[link_start.pop() :])
            if href and href != label and href != "mailto:" + label:
                out.append(f" ({href})")
    return "".join(out)


def _render_table(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    ncols = max(len(r) for r in rows)
    rows = [r + [""] * (ncols - len(r)) for r in rows]
    widths = [max(len(r[i]) for r in rows) for i in range(ncols)]
    lines = []
    for idx, r in enumerate(rows):
        lines.append("| " + " | ".join(c.ljust(widths[i]) for i, c in enumerate(r)) + " |")
        if idx == 0:
            lines.append("|" + "|".join("-" * (w + 2) for w in widths) + "|")
    return "\n".join(lines)


def markdown_to_text(md: str) -> str:
    """Readable plain-text alternative; tables become aligned pipe rows."""
    tokens = _PLAIN_MD.parse(md or "")
    # blocks: (is_list_item, text); list items join with "\n", others "\n\n"
    blocks: list[tuple[bool, str]] = []
    lists: list[dict] = []
    rows: list[list[str]] = []
    row: list[str] = []
    in_table = False
    quote = 0
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t.type == "heading_open":
            text = _inline_text(tokens[i + 1])
            level = int(t.tag[1])
            if level <= 2:
                text = text + "\n" + ("=" if level == 1 else "-") * len(text)
            blocks.append((False, text))
            i += 3
            continue
        if t.type in ("bullet_list_open", "ordered_list_open"):
            lists.append({"ordered": t.type == "ordered_list_open", "n": 0})
        elif t.type in ("bullet_list_close", "ordered_list_close"):
            lists.pop()
        elif t.type == "list_item_open":
            lists[-1]["n"] += 1
        elif t.type == "blockquote_open":
            quote += 1
        elif t.type == "blockquote_close":
            quote -= 1
        elif t.type == "table_open":
            in_table, rows = True, []
        elif t.type == "table_close":
            in_table = False
            blocks.append((False, _render_table(rows)))
        elif t.type == "tr_open":
            row = []
        elif t.type == "tr_close":
            rows.append(row)
        elif t.type == "inline" and in_table:
            row.append(_inline_text(t).replace("\n", " "))
        elif t.type == "inline":
            text = _inline_text(t)
            if lists:
                top = lists[-1]
                pad = "  " * (len(lists) - 1)
                marker = f"{top['n']}." if top["ordered"] else "-"
                text = pad + f"{marker} " + text.replace("\n", "\n" + pad + "  ")
                blocks.append((True, text))
            elif quote:
                blocks.append((False, "\n".join("> " + ln for ln in text.split("\n"))))
            else:
                blocks.append((False, text))
        elif t.type in ("fence", "code_block"):
            blocks.append((False, t.content.rstrip("\n")))
        elif t.type == "hr":
            blocks.append((False, "-" * 40))
        i += 1

    out = ""
    prev_list = False
    for n, (is_list, text) in enumerate(blocks):
        if n:
            out += "\n" if (is_list and prev_list) else "\n\n"
        out += text
        prev_list = is_list
    return out.strip() + "\n"


# ---------------------------------------------------------------------- pdf

_INK = (31, 41, 55)
_PDF_MUTED = (107, 114, 128)
_PDF_LINK = (37, 99, 235)
_PDF_RULE = (209, 213, 219)
_PDF_HEAD_BG = (241, 245, 249)
_PDF_CODE = (71, 85, 105)
_PDF_CODE_BG = (243, 244, 246)
_BODY_PT = 10
_LINE_H = 5.6  # mm, body line height
_HEADING_PT = {1: 18, 2: 14, 3: 12, 4: 11, 5: 10, 6: 10}
_HEADING_SPACE_BEFORE = {1: 6, 2: 6, 3: 4.5, 4: 3.5, 5: 3, 6: 3}

_NUMERIC_RE = re.compile(
    r"^[\s(+\-−]*[€$£]?\s*\d[\d.,\s]*\s*(%|[€$£]|[kKmMbB]|x|pp)?\s*\)?\s*$"
)


def _is_numeric(cell: str) -> bool:
    return bool(_NUMERIC_RE.match(cell.strip()))


def _latin1(text: str) -> bool:
    try:
        text.encode("latin-1")
        return True
    except UnicodeEncodeError:
        return False


def _col_widths(rows: list[list[str]], total: float) -> list[float]:
    ncols = len(rows[0])
    weights = []
    for i in range(ncols):
        longest = max((len(r[i]) for r in rows), default=4)
        weights.append(min(max(longest, 6), 45) ** 0.85)
    s = sum(weights)
    widths = [total * w / s for w in weights]
    floor = total * 0.08
    widths = [max(w, floor) for w in widths]
    s = sum(widths)
    return [w * total / s for w in widths]


class _PdfBuilder:
    def __init__(self, title: str) -> None:
        from fpdf import FPDF

        generated = date.today().isoformat()
        safe_title = title or "Report"

        class _Pdf(FPDF):
            def header(self) -> None:
                self.set_font("Inter", "B", 10)
                self.set_text_color(*_INK)
                self.cell(120, 6, safe_title[:80], align="L")
                self.set_font("Inter", "", 9)
                self.set_text_color(*_PDF_MUTED)
                self.cell(0, 6, generated, align="R", new_x="LMARGIN", new_y="NEXT")
                self.set_draw_color(*_PDF_RULE)
                y = self.get_y() + 1
                self.line(self.l_margin, y, self.w - self.r_margin, y)
                self.set_y(y + 6)

            def footer(self) -> None:
                self.set_y(-14)
                self.set_font("Inter", "", 9)
                self.set_text_color(*_PDF_MUTED)
                self.cell(0, 8, f"{self.page_no()} / {{nb}}", align="C")

        pdf = _Pdf(format="A4", unit="mm")
        pdf.set_margins(18, 18, 18)
        pdf.set_auto_page_break(auto=True, margin=18)
        regular = str(_FONT_DIR / "Inter-Regular.ttf")
        bold = str(_FONT_DIR / "Inter-Bold.ttf")
        pdf.add_font("Inter", "", regular)
        pdf.add_font("Inter", "B", bold)
        pdf.add_font("Inter", "I", regular)
        pdf.add_font("Inter", "BI", bold)
        pdf.alias_nb_pages()
        pdf.set_title(safe_title)
        pdf.set_creator("Personal Finance")
        pdf.add_page()
        self.pdf = pdf
        self.base_left = pdf.l_margin
        self.reset_font()

    # -- helpers
    def reset_font(self, size: float = _BODY_PT) -> None:
        self.pdf.set_font("Inter", "", size)
        self.pdf.set_text_color(*_INK)

    def write_inline(self, tok: Token, size: float = _BODY_PT, base_style: str = "", color=_INK) -> None:
        """Write an inline token's children with wrapping across styled runs."""
        pdf = self.pdf
        bold = italic = 0
        link: list[str] = []
        lh = size * 0.3528 * 1.55
        for c in tok.children or []:
            if c.type == "strong_open":
                bold += 1
            elif c.type == "strong_close":
                bold -= 1
            elif c.type == "em_open":
                italic += 1
            elif c.type == "em_close":
                italic -= 1
            elif c.type == "link_open":
                link.append(str(c.attrGet("href") or ""))
            elif c.type == "link_close" and link:
                link.pop()
            elif c.type in ("softbreak", "hardbreak"):
                pdf.write(lh, "\n")
            elif c.type in ("text", "code_inline"):
                style = ("B" if bold or "B" in base_style else "") + ("I" if italic else "")
                if c.type == "code_inline":
                    pdf.set_text_color(*_PDF_CODE)
                    if _latin1(c.content):
                        pdf.set_font("Courier", "", size - 0.5)
                    else:
                        pdf.set_font("Inter", style, size - 0.5)
                elif link:
                    pdf.set_font("Inter", style, size)
                    pdf.set_text_color(*_PDF_LINK)
                else:
                    pdf.set_font("Inter", style, size)
                    pdf.set_text_color(*color)
                pdf.write(lh, c.content, link=link[-1] if link else "")
        pdf.set_font("Inter", "", size)
        pdf.set_text_color(*_INK)

    def table(self, rows: list[list[str]]) -> None:
        from fpdf.fonts import FontFace

        pdf = self.pdf
        if not rows:
            return
        ncols = max(len(r) for r in rows)
        rows = [r + [""] * (ncols - len(r)) for r in rows]
        body = rows[1:]
        aligns = []
        for i in range(ncols):
            cells = [r[i] for r in body if r[i].strip()]
            aligns.append("RIGHT" if cells and all(_is_numeric(c) for c in cells) else "LEFT")
        usable = pdf.w - pdf.r_margin - pdf.l_margin
        pdf.ln(1.5)
        pdf.set_font("Inter", "", 9)
        pdf.set_text_color(*_INK)
        pdf.set_draw_color(*_PDF_RULE)
        pdf.set_x(pdf.l_margin)
        with pdf.table(
            col_widths=_col_widths(rows, usable),
            text_align=aligns,
            headings_style=FontFace(emphasis="BOLD", color=_INK, fill_color=_PDF_HEAD_BG),
            line_height=5.2,
            padding=(1.6, 2.2),
            repeat_headings=1,
            borders_layout="ALL",
            width=usable,
        ) as t:
            for r in rows:
                t.row(r)
        pdf.ln(4)
        self.reset_font()
        pdf.set_x(pdf.l_margin)

    # -- main walk
    def render(self, md: str) -> None:
        pdf = self.pdf
        tokens = _PLAIN_MD.parse(md or "")
        lists: list[dict] = []
        quote_starts: list[tuple[int, float]] = []
        pending_marker: str | None = None
        rows: list[list[str]] = []
        row: list[str] = []
        in_table = False
        i = 0

        def set_left(x: float) -> None:
            pdf.set_left_margin(x)
            pdf.set_x(x)

        def indent_total() -> float:
            return self.base_left + 6 * len(lists) + 5 * len(quote_starts)

        while i < len(tokens):
            t = tokens[i]
            ty = t.type
            if ty == "heading_open":
                level = int(t.tag[1])
                size = _HEADING_PT[level]
                pdf.ln(_HEADING_SPACE_BEFORE[level] if pdf.get_y() > 30 else 0)
                if pdf.get_y() > pdf.h - 40:  # keep heading with following text
                    pdf.add_page()
                set_left(indent_total())
                pdf.set_font("Inter", "B", size)
                pdf.set_text_color(*_INK)
                self.write_inline(tokens[i + 1], size=size, base_style="B")
                pdf.ln(size * 0.3528 * 1.4 + 1.5)
                i += 3
                continue
            if ty == "paragraph_open":
                set_left(indent_total())
                if pending_marker is not None and lists:
                    pdf.set_x(indent_total() - 6)
                    pdf.set_font("Inter", "", _BODY_PT)
                    pdf.set_text_color(*_INK)
                    pdf.cell(6, _LINE_H, pending_marker)
                    pending_marker = None
                    pdf.set_x(indent_total())
                self.write_inline(tokens[i + 1], color=_PDF_MUTED if quote_starts else _INK)
                pdf.ln(_LINE_H + (0.6 if lists else 2.6))
                i += 3
                continue
            if ty in ("bullet_list_open", "ordered_list_open"):
                lists.append({"ordered": ty == "ordered_list_open", "n": 0})
            elif ty in ("bullet_list_close", "ordered_list_close"):
                lists.pop()
                if not lists:
                    pdf.ln(2.5)
                set_left(indent_total())
            elif ty == "list_item_open":
                top = lists[-1]
                top["n"] += 1
                pending_marker = f"{top['n']}." if top["ordered"] else "•"
            elif ty == "blockquote_open":
                pdf.ln(1.5)
                quote_starts.append((pdf.page, pdf.get_y()))
                set_left(indent_total())
            elif ty == "blockquote_close":
                page, y0 = quote_starts.pop()
                if page == pdf.page:
                    x = indent_total() + 1.2
                    pdf.set_draw_color(*_PDF_RULE)
                    pdf.set_line_width(0.8)
                    pdf.line(x, y0, x, pdf.get_y() - 2)
                    pdf.set_line_width(0.2)
                set_left(indent_total())
            elif ty == "table_open":
                in_table, rows = True, []
            elif ty == "table_close":
                in_table = False
                set_left(indent_total())
                self.table(rows)
            elif ty == "tr_open":
                row = []
            elif ty == "tr_close":
                rows.append(row)
            elif ty == "inline" and in_table:
                row.append(_inline_text(t).replace("\n", " "))
            elif ty in ("fence", "code_block"):
                set_left(indent_total())
                code = t.content.rstrip("\n")
                pdf.set_fill_color(*_PDF_CODE_BG)
                pdf.set_text_color(*_PDF_CODE)
                if _latin1(code):
                    pdf.set_font("Courier", "", 9)
                else:
                    pdf.set_font("Inter", "", 9)
                pdf.multi_cell(0, 4.8, code, fill=True, new_x="LMARGIN", new_y="NEXT")
                pdf.ln(3)
                self.reset_font()
            elif ty == "hr":
                set_left(indent_total())
                pdf.ln(2)
                y = pdf.get_y()
                pdf.set_draw_color(*_PDF_RULE)
                pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
                pdf.ln(4)
            i += 1
        set_left(self.base_left)


# ``markdown_to_pdf`` renders blocks itself (no write_html) so we control list
# marker colour, blockquote bars, table widths/alignment and spacing.


def markdown_to_pdf(md: str, title: str) -> bytes:
    """Render markdown to an A4 PDF (Inter font, Greek capable)."""
    b = _PdfBuilder(title)
    b.render(md)
    return bytes(b.pdf.output())
