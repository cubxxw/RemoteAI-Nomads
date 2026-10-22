"""Exercise reading-path contracts through the CLI and temporary Markdown files."""

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / "scripts" / "check_reading.py"


class ReadingCliTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.home = """# Starting point
[Budget](#budget-and-work) · [Permission](guides/entry-and-work.md)
[Compare](guides/choose-a-base.md) · [First days](#first-week)
[Tools](guides/resources.md) · [Place](#place) · [Other](#other)

<a id="place"></a>
## Place
The room may be noisy. Ask for a current rent quotation.
[Evidence](https://example.org/place/)

<a id="other"></a>
## Other
留意停电；房租与工位分别询价。
[核读记录](research/ledger.md#other-evidence)

<a id="budget-and-work"></a>
## Work and budget
Compare the same dates and room type.
<a id="entry"></a>
## Entry
Check permission before booking.
<a id="first-week"></a>
## First days
Try a working day before extending.
<a id="resources"></a>
## Resources
Useful tools.
"""
        self.destinations = {"destinations": [
            {"id": "place", "name": "Place", "source_ids": ["S1"]},
            {"id": "other", "name": "Other", "source_ids": ["S2"]},
        ]}
        self.sources = {"sources": [
            {"id": "S1", "url": "https://example.org/place"},
            {"id": "S2", "url": "https://example.org/other"},
        ]}
        self.write("README.md", self.home)
        self.write("research/ledger.md", """# Evidence
<a id="other-evidence"></a>
## Other evidence
[Source](https://example.org/other)
""")
        for name in ("choose-a-base", "entry-and-work", "resources"):
            self.write(f"guides/{name}.md", "# Guide\n[Start](../README.md#place)\n")
        self.write_data()

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def write_data(self):
        self.write("data/destinations.json", json.dumps(self.destinations))
        self.write("data/sources-2026-10-14.json", json.dumps(self.sources))

    def check(self, expected=0, script=SCRIPT, root=True, cwd=None, guide=None):
        self.assertTrue(script.is_file(), "reading checker has not been implemented")
        command = [sys.executable, str(script)]
        if root:
            command += ["--root", str(self.root)]
        if guide is not None:
            command += ["--guide", guide]
        result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, check=False)
        output = result.stdout + result.stderr
        self.assertEqual(result.returncode, expected, output)
        self.assertNotIn("Traceback", output)
        return output

    def migrate_guide(self):
        self.write("guides/destination-notes.md", self.home.replace("(guides/", "(")
                   .replace("(research/", "(../research/") + "\n[Project home](../README.md)\n")
        self.write("README.md", "# Website\n[Read guide](guides/destination-notes.md)\n")
        for name in ("entry-and-work", "resources"):
            self.write(f"guides/{name}.md", "# Guide\n[Project home](../README.md)\n")
        # A guide can return to the long guide, while another returns to project home.
        self.write("guides/choose-a-base.md", "# Compare\n[Guide](destination-notes.md#place)\n")

    def test_explicit_guide_supports_migrated_entry_and_relative_routes(self):
        self.migrate_guide()
        self.assertIn("0 error", self.check(guide="guides/destination-notes.md"))

    def test_migrated_guide_requires_working_project_home_entry(self):
        self.migrate_guide()
        self.write("README.md", "# Website\n[Guide](guides/destination-notes.md#missing)\n")
        self.assertIn("README.md:1: missing working reader link to guide",
                      self.check(1, guide="guides/destination-notes.md"))

    def test_migrated_guide_rejects_old_root_relative_navigation(self):
        self.migrate_guide()
        path = self.root / "guides/destination-notes.md"
        path.write_text(path.read_text().replace("[Compare](choose-a-base.md)",
                                                "[Compare](guides/choose-a-base.md)"))
        self.assertIn("guides/destination-notes.md:1: method",
                      self.check(1, guide="guides/destination-notes.md"))

    def test_guide_path_cannot_escape_project(self):
        self.assertIn("relative Markdown path", self.check(1, guide="../outside.md"))

    def test_natural_prose_and_one_hop_sources_pass_without_a_score(self):
        output = self.check()
        self.assertIn("2 primary city", output)
        self.assertIn("0 error", output)
        self.assertNotIn("WARNING", output)
        self.assertIn("not a readability score", output)

    def test_images_are_not_clickable_task_or_evidence_routes(self):
        self.write("README.md", self.home.replace("[Compare]", "![Compare]"))
        self.assertIn("method", self.check(1))
        self.write("README.md", self.home.replace("[Evidence]", "![Evidence]"))
        self.assertIn("place: no reader route", self.check(1))

    def test_html_comments_do_not_supply_routes_or_city_anchors(self):
        self.write("README.md", self.home.replace("[Compare](guides/choose-a-base.md)",
                   "<!-- [Compare](guides/choose-a-base.md) -->"))
        self.assertIn("method", self.check(1))
        self.write("README.md", self.home.replace('<a id="place"></a>',
                   '<!-- <a id="place"></a> -->'))
        self.assertIn("place: missing stable", self.check(1))

    def test_each_primary_city_needs_a_clickable_home_entry(self):
        self.write("README.md", self.home.replace("[Place](#place)", "Place"))
        self.assertIn("place: missing reader link to city anchor", self.check(1))

    def test_linked_image_outer_link_remains_clickable(self):
        self.write("README.md", self.home.replace("[Compare](guides/choose-a-base.md)",
                   "[![Compare](cover.png)](guides/choose-a-base.md)"))
        self.check()

    def test_reference_image_does_not_supply_a_task_route(self):
        self.write("README.md", self.home.replace("[Compare](guides/choose-a-base.md)",
                   "![Compare][method]") + "\n[method]: guides/choose-a-base.md\n")
        self.assertIn("method", self.check(1))

    def test_second_hop_source_does_not_claim_supported_reader_route(self):
        self.write("research/ledger.md", '# Evidence\n<a id="other-evidence"></a>\n'
                   '## Other evidence\n[More](second.md)\n')
        self.write("research/second.md", "[Source](https://example.org/other)\n")
        self.assertIn("other: no reader route", self.check(1))

    def test_heading_slug_cannot_replace_stable_explicit_city_id(self):
        self.write("README.md", self.home.replace('<a id="place"></a>', ""))
        output = self.check(1)
        self.assertRegex(output, r"README\.md:\d+:.*place.*explicit")

    def test_duplicate_explicit_city_anchor_fails_with_location(self):
        self.write("README.md", self.home + '\n<a id="place"></a>\n')
        self.assertRegex(self.check(1), r"README\.md:\d+:.*place.*unique")

    def test_added_data_city_requires_its_own_card_without_fixed_count(self):
        self.destinations["destinations"].append({"id": "new-place", "name": "New", "source_ids": ["S1"]})
        self.write_data()
        self.assertIn("new-place", self.check(1))

    def test_home_requires_each_clickable_task_route(self):
        for route, label in (("[Budget](#budget-and-work)", "budget"),
                             ("[Permission](guides/entry-and-work.md)", "entry"),
                             ("[Compare](guides/choose-a-base.md)", "method"),
                             ("[First days](#first-week)", "first-week"),
                             ("[Tools](guides/resources.md)", "resources")):
            with self.subTest(task=label):
                self.write("README.md", self.home.replace(route, ""))
                self.assertIn(label, self.check(1))

    def test_code_samples_and_unresolved_links_do_not_supply_task_routes(self):
        self.write("README.md", self.home.replace("[First days](#first-week)", "")
                   + "\n```md\n[First days](#first-week)\n```\n")
        self.assertIn("first-week", self.check(1))
        self.write("README.md", self.home.replace("#first-week)", "#absent)"))
        self.assertIn("first-week", self.check(1))

    def test_reference_style_navigation_and_sources_are_accepted(self):
        self.write("README.md", self.home.replace("[Compare](guides/choose-a-base.md)", "[Compare][method]")
                   .replace("[Evidence](https://example.org/place/)", "[Evidence][source]")
                   + "\n[method]: guides/choose-a-base.md\n[source]: https://example.org/place\n")
        self.check()

    def test_standalone_first_week_checklist_is_an_equivalent_task_route(self):
        self.write("guides/first-week-checklist.md", "# First week\n[Start](../README.md)\n")
        self.write("README.md", self.home.replace("[First days](#first-week)",
                                                 "[Try a week](guides/first-week-checklist.md)"))
        self.check()

    def test_every_guide_needs_a_working_route_home(self):
        self.write("guides/new.md", "# New\nNo return route.\n")
        self.assertRegex(self.check(1), r"guides/new\.md:1:.*home")
        self.write("guides/new.md", "# New\n[Home](../README.md#absent)\n")
        self.assertIn("guides/new.md", self.check(1))
        self.write("guides/new.md", "# New\n[Home](../README.md)\n")
        self.check()

    def test_city_source_must_match_its_data_and_not_a_neighbour(self):
        self.write("README.md", self.home.replace("https://example.org/place/", "https://example.org/other"))
        self.assertRegex(self.check(1), r"README\.md:\d+:.*place.*source")

    def test_source_in_another_ledger_section_does_not_count(self):
        self.write("research/ledger.md", """# Evidence
<a id="other-evidence"></a>
## Other evidence
No source here.
## Different place
[Source](https://example.org/other)
""")
        self.assertRegex(self.check(1), r"README\.md:\d+:.*other.*source")

    def test_paragraph_source_anchor_stops_before_next_heading(self):
        self.write("research/ledger.md", """# Evidence
<a id="other-evidence"></a>
No source here.

## Different place
[Source](https://example.org/other)
""")
        self.assertRegex(self.check(1), r"README\.md:\d+:.*other.*source")

    def test_ambiguous_ledger_anchor_cannot_supply_source_evidence(self):
        self.write("research/ledger.md", """# Evidence
<a id="other-evidence"></a>
## First record
[Source](https://example.org/other)
<a id="other-evidence"></a>
## Second record
No source here.
""")
        self.assertIn("other: no reader route", self.check(1))

    def test_inline_code_cannot_supply_reader_entry(self):
        self.write("README.md", self.home.replace("[Place](#place)", "`[Place](#place)`"))
        self.assertIn("place: missing reader link", self.check(1))

    def test_external_home_link_cannot_replace_local_task_route(self):
        self.write("README.md", self.home.replace("[Compare](guides/choose-a-base.md)",
                   "[Compare](https://example.org/guides/choose-a-base.md)"))
        self.assertIn("method", self.check(1))

    def test_source_link_to_full_local_ledger_is_allowed(self):
        self.write("README.md", self.home.replace("research/ledger.md#other-evidence", "research/ledger.md"))
        self.check()

    def test_reddit_post_id_survives_optional_title_and_gallery_urls(self):
        self.sources["sources"][0]["url"] = "https://www.reddit.com/r/example/comments/abc123/post_title/"
        self.write_data()
        self.write("README.md", self.home.replace("https://example.org/place/", "https://www.reddit.com/gallery/abc123"))
        self.check()

    def test_missing_risk_or_cost_language_is_a_nonblocking_review_reminder(self):
        self.write("README.md", self.home.replace("The room may be noisy. Ask for a current rent quotation.",
                                                 "A pleasant place to stay."))
        output = self.check()
        self.assertRegex(output, r"WARNING README\.md:\d+:.*place.*risk")
        self.assertRegex(output, r"WARNING README\.md:\d+:.*place.*cost")

    def test_later_card_cannot_supply_missing_risk_or_cost(self):
        self.write("README.md", self.home.replace("The room may be noisy. Ask for a current rent quotation.", ""))
        output = self.check()
        self.assertIn("place: risk", output)
        self.assertIn("place: cost", output)

    def test_missing_empty_and_malformed_data_are_friendly_failures(self):
        for text in (None, "{bad", "[]", '{"destinations": []}',
                     '{"destinations": [null]}', '{"destinations": [{"id": []}]}'):
            with self.subTest(text=text):
                path = self.root / "data/destinations.json"
                if text is None:
                    path.unlink()
                else:
                    path.write_text(text, encoding="utf-8")
                self.assertIn("data/destinations.json", self.check(1))

    def test_nonexistent_root_is_a_friendly_failure(self):
        missing = self.root / "missing"
        result = subprocess.run([sys.executable, str(SCRIPT), "--root", str(missing)],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("root", result.stdout)
        self.assertNotIn("Traceback", result.stdout + result.stderr)

    def test_default_root_is_relative_to_script_not_working_directory(self):
        self.assertTrue(SCRIPT.is_file(), "reading checker has not been implemented")
        directory = self.root / "scripts"
        directory.mkdir()
        for name in ("check_reading.py", "check_links.py"):
            shutil.copyfile(REPO / "scripts" / name, directory / name)
        elsewhere = self.root / "elsewhere"
        elsewhere.mkdir()
        self.check(script=directory / "check_reading.py", root=False, cwd=elsewhere)


if __name__ == "__main__":
    unittest.main()
