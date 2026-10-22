"""Exercise the link checker through its public CLI using real temporary files."""

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check_links.py"


class CheckLinksTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def write(self, path, text):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    def check(self, expected=0, exclude=()):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(self.root)]
            + [argument for name in exclude for argument in ("--exclude", name)],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return result.stdout + result.stderr

    def test_directory_exclusion_is_explicit_and_keeps_guide_errors(self):
        self.write("web/docs/history.md", "[Missing evidence](untracked.md)\n")
        self.assertIn("web/docs/history.md:1:", self.check(1))
        output = self.check(exclude=("web",))
        self.assertIn("Excluded scan directories: web", output)
        self.assertIn("Checked 0 Markdown files", output)
        self.write("guides/stay.md", "[Missing guide](absent.md)\n")
        output = self.check(1, exclude=("web",))
        self.assertIn("guides/stay.md:1:", output)
        self.assertNotIn("web/docs/history.md:1:", output)

    def test_exclusions_repeat_and_match_directories_exactly(self):
        for directory in ("web", "archive", "web-guide"):
            self.write(f"{directory}/notes.md", "[Missing](absent.md)\n")
        output = self.check(1, exclude=("web", "archive"))
        self.assertIn("web-guide/notes.md:1:", output)
        self.assertNotIn("web/notes.md:1:", output)
        self.assertNotIn("archive/notes.md:1:", output)

    def test_exclusion_does_not_hide_incoming_links_from_guides(self):
        self.write("guides/stay.md", "[Evidence](../web/missing.md)\n")
        self.assertIn("../web/missing.md", self.check(1, exclude=("web",)))

    def test_exclusions_cannot_skip_project_or_escape_it(self):
        for directory in (".", "..", "/tmp"):
            with self.subTest(directory=directory):
                self.assertIn("relative directory", self.check(2, exclude=(directory,)))

    def test_missing_file_and_anchor_have_source_lines_and_targets(self):
        self.write("README.md", "# Start\n[missing](no.md)\n[anchor](#absent)\n")
        output = self.check(1)
        self.assertRegex(output, r"README\.md:2:.*no\.md")
        self.assertRegex(output, r"README\.md:3:.*#absent")

    def test_chinese_explicit_ids_and_duplicate_heading_slugs(self):
        self.write("README.md", """# 起点
[中文](子目录/guide.md#中文标题)
[英文](子目录/guide.md#hello-world)
[重复](子目录/guide.md#中文标题-1)
[碰撞](子目录/guide.md#中文标题-1-1)
[显式](子目录/guide.md#custom-ID)
[Setext](子目录/guide.md#setext-heading)
""")
        self.write("子目录/guide.md", """# 中文标题
## Hello, **World**!
## 中文标题
## 中文标题-1
<a id="custom-ID"></a>
Setext Heading
--------------
""")
        self.check()

    def test_paths_fragments_spaces_titles_images_and_directories(self):
        self.write("README.md", """# Guide
[angle](<子 目录/有 空格.md#中文%20标题> "title")
[encoded](子%20目录/有%20空格.md#中文%20标题)
[space](子 目录/有 空格.md#中文%20标题)
[dir](子%20目录/)
![image](picture%20one.png)
[paren](part(one).md 'title')
""")
        self.write("子 目录/有 空格.md", '<a id="中文 标题"></a>\n')
        self.write("picture one.png", "image placeholder")
        self.write("part(one).md", "# Part\n")
        self.check()

    def test_emphasized_headings_keep_literal_intra_word_underscores(self):
        self.write("README.md", """# _Guide_
## __中文 指南__
## snake_case
## \_Literal\_
## `_Code_`
[one](#guide)
[two](#中文-指南)
[three](#snake_case)
[four](#_literal_)
[five](#_code_)
""")
        self.check()

    def test_markdown_escaped_link_destination_resolves_real_filename(self):
        self.write("part(one).md", "# Part\n")
        self.write(r"part\name.md", "# Backslash\n")
        self.write("README.md", r"[inline](part\(one\).md)" + "\n"
                   + r"[reference][escaped]" + "\n"
                   + r"[angle](<part\(one\).md>)" + "\n"
                   + r"[ordinary backslash](part\name.md)" + "\n"
                   + r"[escaped]: part\(one\).md" + "\n")
        self.check()

    def test_reference_links_images_collapsed_and_shortcut(self):
        self.write("README.md", """[guide][Reference Name]
![picture][image]
[collapsed][] and [shortcut] and ordinary [文字]
[reference name]: docs/guide.md#标题 "title"
[image]: <image one.png>
[collapsed]: docs/guide.md
[shortcut]: docs/guide.md
""")
        self.write("docs/guide.md", "# 标题\n")
        self.write("image one.png", "image placeholder")
        self.check()

    def test_parenthetical_titles_and_angle_paths_with_unbalanced_parenthesis(self):
        self.write("README.md", """[title](guide.md (chapter title))
[angle](<odd(name.md>)
[quote](guide.md "title with a ) character")
[reference][ref]
[ref]: guide.md (reference title)
""")
        self.write("guide.md", "# Guide\n")
        self.write("odd(name.md", "# Odd\n")
        self.check()
        self.write("README.md", "[bad](<missing(name.md>)\n")
        self.assertRegex(self.check(1), r"README\.md:1:.*missing\(name\.md")

    def test_undefined_references_and_broken_defined_shortcuts(self):
        self.write("README.md", """[missing][undefined]
![picture][no-image]
[collapsed][]
[shortcut]
[shortcut]: gone.md
""")
        output = self.check(1)
        for line, target in [(1, "undefined"), (2, "no-image"),
                             (3, "collapsed"), (4, "gone.md")]:
            self.assertRegex(output, rf"README\.md:{line}:.*{target}")

    def test_code_examples_are_ignored_but_code_in_link_labels_is_checked(self):
        self.write("README.md", """# Visible
```markdown
[bad](absent.md)
# Hidden
[ref]: gone.md
```
~~~
[bad][undefined]
~~~
`[bad](missing.md)` and `` `[bad](other.md)` ``
[`guide`](target.md#real)
[ordinary](https://example.invalid/whatever)
""")
        self.write("target.md", "# Real\n")
        self.check()
        self.write("README.md", self.root.joinpath("README.md").read_text()
                   + "[`broken`](missing.md)\n[hidden](#hidden)\n")
        output = self.check(1)
        self.assertRegex(output, r"README\.md:13:.*missing\.md")
        self.assertRegex(output, r"README\.md:14:.*#hidden")

    def test_multiline_inline_code_does_not_create_links_or_headings(self):
        self.write("README.md", "# Real\n`example\n[bad](missing.md)\n# Hidden\n`\n[bad](#hidden)\n")
        output = self.check(1)
        self.assertRegex(output, r"README\.md:6:.*#hidden")
        self.assertNotIn("missing.md", output)

    def test_duplicate_explicit_ids_report_the_second_location(self):
        self.write("README.md", '<a id="same"></a>\n<a id=\'same\'></a>\n')
        output = self.check(1)
        self.assertRegex(output, r"README\.md:2:.*duplicate.*same")

    def test_relative_links_are_resolved_from_source_document(self):
        self.write("README.md", "# Root\n")
        self.write("docs/README.md", "[root](../README.md#root)\n[dir](../docs)\n")
        self.check()

    def test_external_schemes_and_plain_brackets_are_ignored(self):
        self.write("README.md", """[one](https://invalid.example/no.md#none)
[two](mailto:somebody@example.invalid)
[three](tel:+10000)
[four](//invalid.example/missing)
[five](data:image/png;base64,abc)
Plain [文字] and [42] and escaped \[text](absent.md).
""")
        self.check()

    def test_generated_and_work_directories_are_excluded(self):
        self.write("README.md", "# Good\n")
        for directory in [".git", ".worktrees", "node_modules", ".venv", "build", "dist", "__pycache__"]:
            self.write(f"{directory}/README.md", "[bad](missing.md)\n")
        self.check()

    def test_default_root_is_script_parent_regardless_of_current_directory(self):
        self.assertTrue(SCRIPT.is_file(), "checker script has not been implemented")
        self.write("scripts/check_links.py", SCRIPT.read_text(encoding="utf-8"))
        self.write("README.md", "[bad](missing.md)\n")
        other = self.root / "elsewhere"
        other.mkdir()
        result = subprocess.run([sys.executable, str(self.root / "scripts/check_links.py")],
                                cwd=other, capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("README.md:1:", result.stdout + result.stderr)

    def test_nonexistent_root_fails(self):
        self.root.rmdir()
        self.check(1)


if __name__ == "__main__":
    unittest.main()
