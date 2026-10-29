"""En enkel PDF med text, för demodatans kontrakt. Inga beroenden: PDF:en skrivs för hand med
typsnittet Helvetica, som alla PDF-läsare har."""


def _escape(text: str) -> bytes:
    raw = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    # WinAnsiEncoding täcker å, ä och ö.
    return raw.encode("cp1252", "replace")


def make_pdf(title: str, paragraphs: list[str]) -> bytes:
    """En A4-sida med rubrik och stycken. Långa stycken bryts vid cirka 90 tecken."""
    lines: list[tuple[int, str]] = [(18, title), (11, "")]
    for paragraph in paragraphs:
        words, line = paragraph.split(), ""
        for word in words:
            if len(line) + len(word) + 1 > 90:
                lines.append((11, line))
                line = word
            else:
                line = f"{line} {word}".strip()
        lines.append((11, line))
        lines.append((11, ""))

    content = b"BT\n/F1 18 Tf\n56 780 Td\n"
    current = 18
    for size, text in lines:
        if size != current:
            content += f"/F1 {size} Tf\n".encode()
            current = size
        content += b"(" + _escape(text) + b") Tj\n0 -" + str(size + 6).encode() + b" Td\n"
    content += b"ET\n"

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"endstream",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    ).encode()
    return out
