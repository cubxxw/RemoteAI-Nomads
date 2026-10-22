#!/usr/bin/env python3
"""Check repository-local Markdown links without network access (Python 3.10+).

Supports single-line inline links/images, full/collapsed references, defined
shortcut references, ATX/Setext headings and <a id="..."> anchors. Heading slugs
follow common GitHub English/Chinese rules, including duplicate suffixes and
simple emphasis. Markdown punctuation escapes in destinations are normalized.
Fenced blocks and inline code are ignored. Bare [words] without a definition
are ordinary text; undefined explicit [text][id] / [text][] are errors.
This is a bounded repository check, not a complete CommonMark/HTML parser:
multiline link syntax, indented code, HTML hrefs and non-Markdown fragments
are outside its scope. Existing directory targets require no index file.
"""

import argparse
from html import unescape
import os
from pathlib import Path
import re
import unicodedata
from urllib.parse import unquote, urlsplit


EXCLUDED = {".git", ".hg", ".svn", ".worktrees", "worktrees", "node_modules",
            ".venv", "venv", "__pycache__", ".pytest_cache", ".mypy_cache",
            "build", "dist", ".next", ".cache", ".tox"}
DEFINITION = re.compile(r"^ {0,3}\[([^\]]+)\]:\s*(.*)$")
EXPLICIT_ID = re.compile(r"<a\b[^>]*?\bid\s*=\s*(['\"])(.*?)\1[^>]*>", re.I)


def blank(text):
    return re.sub(r"[^\n]", " ", text)


def visible_text(text):
    """Keep offsets/line numbers stable while hiding fenced and inline code."""
    lines, fence = [], None
    for line in text.splitlines(keepends=True):
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
        if fence:
            lines.append(blank(line))
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence) and not marker[2].strip():
                fence = None
        elif marker:
            fence = marker[1]
            lines.append(blank(line))
        else:
            lines.append(line)
    fenced = "".join(lines)
    masked = list(fenced)
    position = 0
    while match := re.search(r"`+", fenced[position:]):
        start = position + match.start()
        end = position + match.end()
        close = re.search(r"(?<!`)" + re.escape(match[0]) + r"(?!`)", fenced[end:])
        if close:
            stop = end + close.end()
            masked[start:stop] = blank(fenced[start:stop])
            position = stop
        else:
            position = end
    return fenced.splitlines(), "".join(masked).splitlines()


def destination(text):
    text = text.strip()
    if text.startswith("<") and ">" in text:
        text = text[1:text.index(">")]
    else:
        text = re.sub(r"\s+(?:(['\"]).*\1|\(.*\))\s*$", "", text).strip()
    return re.sub(r"\\([!-/:-@\[-`{-~])", r"\1", text)


def reference_id(text):
    return " ".join(text.split()).casefold()


def closing(text, start, opener, closer):
    depth, position = 1, start + 1
    while position < len(text):
        char = text[position]
        if char == "\\":
            position += 2
            continue
        if opener == "(" and (char == "<" or (char in "'\"" and text[position - 1].isspace())):
            delimiter = ">" if char == "<" else char
            end = re.search(r"(?<!\\)" + re.escape(delimiter), text[position + 1:])
            if end:
                position += end.end() + 1
                continue
        if char == opener:
            depth += 1
        elif char == closer:
            depth -= 1
            if not depth:
                return position
        position += 1
    return None


def links(raw, masked, references):
    """Yield (target, undefined_reference) pairs; code-masked offsets match raw."""
    position = 0
    while position < len(masked):
        if masked[position] == "\\":
            position += 2
            continue
        if masked[position] != "[":
            position += 1
            continue
        end = closing(masked, position, "[", "]")
        if end is None:
            position += 1
            continue
        label, after = raw[position + 1:end], end + 1
        if after < len(masked) and masked[after] == "(":
            stop = closing(masked, after, "(", ")")
            if stop is not None:
                yield destination(raw[after + 1:stop]), False
                position = stop + 1
                continue
        elif after < len(masked) and masked[after] == "[":
            stop = closing(masked, after, "[", "]")
            if stop is not None:
                key = reference_id(raw[after + 1:stop] or label)
                yield references.get(key, key), key not in references
                position = stop + 1
                continue
        key = reference_id(label)
        if key in references:
            yield references[key], False
        position = after


def slug(text):
    # Leave code spans, escaped underscores and intra-word underscores literal.
    text = re.sub(r"(`+).*?\1|(?<![\\\w])(_{1,2})(?=\S)(.+?)(?<!\\)\2(?!\w)",
                  lambda match: match[0] if match[1] else match[3], text)
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = unescape(re.sub(r"<[^>]*>", "", text)).lower()
    text = "".join(c for c in text if c in "-_" or unicodedata.category(c)[0] not in "PS")
    return text.strip().replace(" ", "-")


def parse(path):
    raw, masked = visible_text(path.read_text(encoding="utf-8"))
    references, definitions = {}, set()
    for index, line in enumerate(masked):
        if match := DEFINITION.match(line):
            references.setdefault(reference_id(match[1]), destination(raw[index][match.start(2):]))
            definitions.add(index)
    anchors, heading_ids, explicit_ids, targets, errors = set(), set(), set(), [], []
    for index, line in enumerate(masked):
        number = index + 1
        for match in EXPLICIT_ID.finditer(line):
            value = unescape(match[2])
            if value in explicit_ids:
                errors.append((number, f"duplicate explicit id: {value}"))
            explicit_ids.add(value)
            anchors.add(value)
        heading = re.match(r"^ {0,3}#{1,6}(?:[ \t]|$)(.*)", line)
        title = None
        if heading:
            title = re.sub(r"[ \t]+#+[ \t]*$", "", raw[index][heading.start(1):])
        elif line.strip() and index + 1 < len(masked) and re.fullmatch(r" {0,3}(?:=+|-+)[ \t]*", masked[index + 1]):
            title = raw[index]
        if title is not None:
            base, candidate, count = slug(title), slug(title), 0
            while candidate in heading_ids:
                count += 1
                candidate = f"{base}-{count}"
            heading_ids.add(candidate)
            anchors.add(candidate)
        if index not in definitions:
            targets.extend((number, target, missing) for target, missing in links(raw[index], line, references))
    return anchors, targets, errors


def check(root, exclude=()):
    excluded_paths = set()
    for name in exclude:
        relative = Path(name)
        resolved = (root / relative).resolve()
        if (relative.is_absolute() or resolved == root or not resolved.is_relative_to(root)
                or (resolved.exists() and not resolved.is_dir())):
            raise ValueError(f"exclude must name a relative directory inside the project: {name}")
        excluded_paths.add(resolved)
    paths = []
    for parent, directories, files in os.walk(root):
        directories[:] = sorted(d for d in directories if d not in EXCLUDED
                                and (Path(parent) / d).resolve() not in excluded_paths)
        paths.extend(Path(parent) / name for name in sorted(files) if name.endswith(".md"))
    cache, errors = {}, []

    def document(path):
        if path not in cache:
            cache[path] = parse(path)
        return cache[path]

    for path in paths:
        display = path.relative_to(root)
        try:
            _, targets, diagnostics = document(path)
            errors.extend(f"{display}:{line}: {message}" for line, message in diagnostics)
            for line, target, missing in targets:
                prefix = f"{display}:{line}:"
                if missing:
                    errors.append(f"{prefix} undefined reference: {target}")
                    continue
                try:
                    url = urlsplit(unescape(target))
                    if url.scheme or url.netloc:
                        continue
                    relative = unquote(url.path)
                    resolved = ((root / relative.lstrip("/")) if relative.startswith("/") else path.parent / relative).resolve() if relative else path
                    if not resolved.exists():
                        errors.append(f"{prefix} missing local target: {target}")
                    elif url.fragment and resolved.is_file() and resolved.suffix.lower() == ".md" and unquote(url.fragment) not in document(resolved)[0]:
                        errors.append(f"{prefix} missing anchor: {target}")
                except (OSError, UnicodeError, ValueError) as error:
                    errors.append(f"{prefix} cannot check {target}: {error}")
        except (OSError, UnicodeError) as error:
            errors.append(f"{display}:1: cannot read document: {error}")
    return paths, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--exclude", action="append", default=[], metavar="DIRECTORY",
                        help="exclude this project-relative directory from scanning (repeatable)")
    args = parser.parse_args()
    root = args.root.resolve()
    if not root.is_dir():
        print(f"{root}:1: root directory does not exist")
        return 1
    try:
        paths, errors = check(root, args.exclude)
    except ValueError as exc:
        parser.exit(2, f"ERROR {exc}\n")
    if args.exclude:
        print("Excluded scan directories: " + ", ".join(args.exclude))
    for error in errors:
        print(error)
    print(f"Checked {len(paths)} Markdown files; {len(errors)} local link error(s).")
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
