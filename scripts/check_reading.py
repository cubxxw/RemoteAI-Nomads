#!/usr/bin/env python3
"""Check reader routes and city-card structure offline with Python 3.10+.

Use --guide for a project-relative guide entry after moving cards out of README;
the project README must link directly to that entry.

Errors cover missing task routes, guide return paths, stable city IDs, and a
route from each card to at least one source named by that city's data. Source
routes may be direct or through one local Markdown document/section; they do
not verify a source's truth, freshness, or support for every claim.

Risk/cost vocabulary only produces review warnings: natural prose and unknown
costs are welcome. This is not a readability score, fact check, browser check,
or substitute for the manual rubric in research/reading-quality-rubric.md.
Markdown support is bounded like check_links.py. Images and HTML comments
are excluded from reader routes; this does not model CSS, collapsed content,
external-site availability, link visibility, or actual clickability in a browser.
"""

import argparse
from html import unescape
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

import check_links


TASKS = {
    "budget": (("README.md", "budget-and-work"),),
    "entry": (("README.md", "entry"), ("guides/entry-and-work.md", "")),
    "method": (("guides/choose-a-base.md", ""),),
    "first-week": (("README.md", "first-week"), ("guides/first-week-checklist.md", "")),
    "resources": (("README.md", "resources"), ("guides/resources.md", "")),
}
# Heuristics are deliberately nonblocking. A match is not semantic validation.
RISK = re.compile(
    r"风险|主要坑|代价|注意|留意|限制|不保证|不能|不适|未核|另核|需核|待核|"
    r"噪音|停电|洪水|湿|吵|拥堵|高原|签证|"
    r"\b(?:risk|caveat|beware|noise|noisy|outage|limitation|uncertain|caution)\b", re.I)
COST = re.compile(
    r"费用|花费|预算|房租|月租|报价|询价|待询|另问|租金|成本|价格|收费|"
    r"美元|欧元|泰铢|马币|比索|越南盾|人民币|元[/／]|"
    r"\b(?:cost|price|budget|rent|quotation|quote|USD|EUR|THB|MYR|VND|MXN|BRL|CNY)\b", re.I)


def source_key(target):
    """Compare public URLs without requiring Reddit's optional title slug."""
    try:
        url = urlsplit(unescape(target))
    except ValueError:
        return None
    if url.scheme.lower() not in ("http", "https") or not url.netloc:
        return None
    host = url.netloc.lower().removeprefix("www.")
    path = unquote(url.path).rstrip("/")
    if host in ("reddit.com", "old.reddit.com"):
        post = re.search(r"/(?:comments|gallery)/([a-zA-Z0-9]+)(?:/|$)", path)
        if post:
            return "reddit.com", post[1].lower(), ""
    return host, path, url.query


class Document:
    def __init__(self, path):
        self.path = path
        source = path.read_text(encoding="utf-8")
        source = re.sub(r"<!--.*?(?:-->|\Z)", lambda m: check_links.blank(m[0]), source, flags=re.S)
        self.raw, self.masked = check_links.visible_text(source)
        # Images are rendered media, not navigation. Preserve offsets so a
        # linked image's OUTER link still counts as a reader route.
        for index, line in enumerate(self.masked):
            chars, position = list(line), 0
            while position < len(line):
                if line[position] == "\\":
                    position += 2
                    continue
                if line[position:position + 2] != "![":
                    position += 1
                    continue
                end = check_links.closing(line, position + 1, "[", "]")
                if end is None:
                    position += 2
                    continue
                stop = end
                if end + 1 < len(line) and line[end + 1] in "([":
                    opener = line[end + 1]
                    stop = check_links.closing(line, end + 1, opener, ")" if opener == "(" else "]") or end
                chars[position:stop + 1] = " " * (stop + 1 - position)
                position = stop + 1
            self.masked[index] = "".join(chars)
        references, definitions = {}, set()
        for index, line in enumerate(self.masked):
            if match := check_links.DEFINITION.match(line):
                references.setdefault(check_links.reference_id(match[1]),
                                      check_links.destination(self.raw[index][match.start(2):]))
                definitions.add(index)
        self.links = [(index + 1, target, missing)
                      for index, line in enumerate(self.masked) if index not in definitions
                      for target, missing in check_links.links(self.raw[index], line, references)]
        self.anchors = set()
        self.explicit, self.headings = {}, []
        heading_ids = set()
        for index, line in enumerate(self.masked):
            for match in check_links.EXPLICIT_ID.finditer(line):
                self.explicit.setdefault(unescape(match[2]), []).append(index)
                self.anchors.add(unescape(match[2]))
            heading = re.match(r"^ {0,3}(#{1,6})(?:[ \t]|$)(.*)", line)
            title, level = None, None
            if heading:
                title = re.sub(r"[ \t]+#+[ \t]*$", "", self.raw[index][heading.start(2):])
                level = len(heading[1])
            elif line.strip() and index + 1 < len(self.masked) and re.fullmatch(
                    r" {0,3}(?:=+|-+)[ \t]*", self.masked[index + 1]):
                title = self.raw[index]
                level = 1 if self.masked[index + 1].lstrip().startswith("=") else 2
            if title is not None:
                base = candidate = check_links.slug(title)
                count = 0
                while candidate in heading_ids:
                    count += 1
                    candidate = f"{base}-{count}"
                heading_ids.add(candidate)
                self.anchors.add(candidate)
                self.headings.append((index, level, candidate))

    def section(self, fragment=""):
        """Return line offsets for a whole document or a targeted section."""
        if not fragment:
            return 0, len(self.masked)
        positions = self.explicit.get(fragment, [])
        if positions:
            start = positions[0]
        else:
            start = next((line for line, _, key in self.headings if key == fragment), None)
        if start is None:
            return None
        first = next(((line, level) for line, level, _ in self.headings if line >= start), None)
        if first is None or any(line.strip() for line in self.masked[start + 1:first[0]]):
            # Paragraph anchors stop before the next heading or explicit anchor.
            # Only a title immediately after an anchor belongs to its section.
            boundaries = [line for lines in self.explicit.values() for line in lines if line > start]
            if first is not None:
                boundaries.append(first[0])
            end = min(boundaries, default=len(self.masked))
        else:
            title_line, level = first
            end = next((line for line, depth, _ in self.headings if line > title_line and depth <= level),
                       len(self.masked))
        return start, end

    def targets(self, bounds=None):
        start, end = bounds if bounds is not None else (0, len(self.masked))
        return [target for line, target, missing in self.links if not missing and start <= line - 1 < end]


def check(root, guide="README.md"):
    errors, warnings, cache = [], [], {}

    def error(path, line, message):
        errors.append(f"{path}:{line}: {message}")

    def document(path):
        if path not in cache:
            try:
                cache[path] = Document(path)
            except (OSError, UnicodeError) as exc:
                error(path.relative_to(root), 1, f"cannot read document: {exc}")
                cache[path] = None
        return cache[path]

    def load_rows(name, key):
        path = root / name
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            rows = data.get(key) if isinstance(data, dict) else None
            if not isinstance(rows, list) or not rows or not all(isinstance(row, dict) for row in rows):
                raise ValueError(f"expected a non-empty {key} array of records")
            return rows
        except (OSError, UnicodeError, ValueError, RecursionError) as exc:
            error(name, 1, f"cannot read reading-path data: {exc}")
            return []

    def local_target(source, target):
        try:
            url = urlsplit(unescape(target))
            if url.scheme or url.netloc:
                return None
            relative = unquote(url.path)
            path = ((root / relative.lstrip("/")) if relative.startswith("/")
                    else source.parent / relative).resolve() if relative else source
            if not path.is_relative_to(root) or not path.is_file():
                return None
            fragment = unquote(url.fragment)
            if path.suffix.lower() == ".md":
                doc = document(path)
                if doc is None or (fragment and (fragment not in doc.anchors
                                               or len(doc.explicit.get(fragment, [])) > 1)):
                    return None
            return path, fragment
        except (OSError, ValueError):
            return None

    destinations = load_rows("data/destinations.json", "destinations")
    sources = load_rows("data/sources-2026-10-14.json", "sources")
    source_urls = {row["id"]: source_key(row["url"]) for row in sources
                   if isinstance(row.get("id"), str) and isinstance(row.get("url"), str)}
    landing_path = root / "README.md"
    home_path = (root / guide).resolve()
    if Path(guide).is_absolute() or not home_path.is_relative_to(root) or home_path.suffix.lower() != ".md":
        error("README.md", 1, "guide must be a relative Markdown path inside the project")
        return len(destinations), errors, warnings
    guide_name = str(home_path.relative_to(root))
    if home_path != landing_path:
        landing = document(landing_path)
        if landing is not None and not any(
                resolved and resolved[0] == home_path
                for target in landing.targets()
                for resolved in [local_target(landing_path, target)]):
            error("README.md", 1, f"missing working reader link to guide {guide_name}")
    home = document(home_path)
    if home is None:
        return len(destinations), errors, warnings

    routes = [resolved for target in home.targets() if (resolved := local_target(home_path, target))]
    for task, defaults in TASKS.items():
        alternatives = tuple((guide_name if name == "README.md" else name, fragment)
                             for name, fragment in defaults)
        if not any((root / name, fragment) in routes or
                   (not fragment and any(path == root / name for path, _ in routes))
                   for name, fragment in alternatives):
            options = " or ".join(name + (f"#{fragment}" if fragment else "")
                                  for name, fragment in alternatives)
            error(guide_name, 1, f"{task}: missing working reader link to {options}")

    for guide_path in sorted((root / "guides").rglob("*.md")):
        guide = document(guide_path)
        if guide and not any(resolved and resolved[0] in ({landing_path, home_path} - {guide_path})
                             for target in guide.targets()
                             for resolved in [local_target(guide_path, target)]):
            error(guide_path.relative_to(root), 1, f"missing working link home to README.md or {guide_name}")

    primary_ids = {row["id"] for row in destinations if isinstance(row.get("id"), str)}
    seen_ids = set()
    for index, city in enumerate(destinations):
        city_id = city.get("id")
        if not isinstance(city_id, str) or not city_id.strip() or city_id in seen_ids:
            error("data/destinations.json", 1, f"destinations[{index}].id: expected unique non-empty text")
            continue
        seen_ids.add(city_id)
        positions = home.explicit.get(city_id, [])
        if not positions:
            error(guide_name, 1, f"{city_id}: missing stable explicit city anchor")
            continue
        if len(positions) != 1:
            error(guide_name, positions[1] + 1, f"{city_id}: city anchor must be unique")
            continue
        if (home_path, city_id) not in routes:
            error(guide_name, positions[0] + 1, f"{city_id}: missing reader link to city anchor")
        start, end = home.section(city_id)
        # A later primary card must never satisfy this card's content checks.
        end = min([end] + [line for key, lines in home.explicit.items() if key != city_id
                           and key in primary_ids
                           for line in lines if line > start])
        text = "\n".join(home.masked[start:end])
        for label, pattern in (("risk", RISK), ("cost", COST)):
            if not pattern.search(text):
                warnings.append(f"{guide_name}:{start + 1}: {city_id}: {label} information not recognized; "
                                "review the card manually (wording heuristic only)")

        source_ids = city.get("source_ids", [])
        expected = {source_urls[key] for key in source_ids if isinstance(key, str) and source_urls.get(key)} \
            if isinstance(source_ids, list) else set()
        reachable = set()
        for target in home.targets((start, end)):
            if key := source_key(target):
                reachable.add(key)
                continue
            resolved = local_target(home_path, target)
            if resolved and resolved[0].suffix.lower() == ".md":
                linked = document(resolved[0])
                bounds = linked.section(resolved[1])
                if bounds is not None:
                    reachable.update(key for item in linked.targets(bounds) if (key := source_key(item)))
        if not expected.intersection(reachable):
            error(guide_name, start + 1, f"{city_id}: no reader route to a source in this city's source_ids "
                  "(link directly or through one local Markdown document/section)")
    return len(destinations), errors, warnings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--guide", default="README.md", help="project-relative Markdown guide entry (default: README.md)")
    args = parser.parse_args()
    root = args.root.resolve()
    if not root.is_dir():
        print(f"ERROR {root}:1: root directory does not exist")
        return 1
    count, errors, warnings = check(root, args.guide)
    for message in errors:
        print(f"ERROR {message}")
    for message in warnings:
        print(f"WARNING {message}")
    print(f"Checked {count} primary city card(s); {len(errors)} error(s), {len(warnings)} warning(s).")
    print("Structure only; not a readability score or verification of facts, freshness, or browser layout.")
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
