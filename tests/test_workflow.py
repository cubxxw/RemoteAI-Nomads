"""Exercise the actual Git whitespace gate against temporary local histories."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("check_workflow", Path(__file__).resolve().parents[1] / "scripts/check_workflow.py")
workflow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workflow)


class WhitespaceGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q")
        self.git("config", "user.name", "CI test")
        self.git("config", "user.email", "ci@example.invalid")
        self.commit("clean\n")
        self.base = self.git("rev-parse", "HEAD").stdout.strip()

    def git(self, *args):
        return subprocess.run(["git", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", *args], cwd=self.root, text=True, capture_output=True, check=True)

    def commit(self, text):
        (self.root / "guide.md").write_text(text, encoding="utf-8")
        self.git("add", "guide.md")
        self.git("commit", "-qm", "fixture")

    def test_push_checks_bad_earlier_commit(self):
        self.commit("clean\nbad  \n")
        (self.root / "other.md").write_text("okay\n")
        self.git("add", ".")
        self.git("commit", "-qm", "later clean commit")
        self.assertNotEqual(workflow.check("push", {"before": self.base}, self.root).returncode, 0)

    def test_pr_checks_base_range(self):
        self.commit("clean\nbad\t\n")
        self.assertNotEqual(workflow.check("pull_request", {"pull_request": {"base": {"sha": self.base}}}, self.root).returncode, 0)

    def test_initial_push_and_scheduled_scan_full_tree(self):
        self.commit("bad  \n")
        for event, payload in (("push", {"before": "0" * 40}), ("schedule", {}), ("workflow_dispatch", {})):
            with self.subTest(event=event):
                self.assertNotEqual(workflow.check(event, payload, self.root).returncode, 0)

    def test_clean_range_passes(self):
        self.commit("clean change\n")
        self.assertEqual(workflow.check("push", {"before": self.base}, self.root).returncode, 0)

    def test_missing_or_unsafe_base_fails_closed(self):
        for base in ("f" * 40, "--output=unsafe"):
            with self.subTest(base=base), self.assertRaises(ValueError):
                workflow.check("push", {"before": base}, self.root)

    def test_missing_event_base_fails_closed(self):
        for event, payload in (
            ("push", {}), ("push", {"before": None}),
            ("push", {"before": ""}),
            ("pull_request", {}),
            ("pull_request", {"pull_request": {"base": {}}}),
            ("pull_request", {"pull_request": {"base": {"sha": "0" * 40}}}),
        ):
            with self.subTest(event=event, payload=payload), self.assertRaises(ValueError):
                workflow.check(event, payload, self.root)

    def test_malformed_zero_push_base_fails_closed(self):
        for base in ("0", "0" * 39, "0" * 41, 0):
            with self.subTest(base=base), self.assertRaises(ValueError):
                workflow.check("push", {"before": base}, self.root)

    def test_malformed_event_objects_fail_with_actionable_error(self):
        for event, payload in (
            ("push", []), ("push", None),
            ("pull_request", {"pull_request": None}),
            ("pull_request", {"pull_request": {"base": []}}),
            ("pull_request", {"pull_request": {"base": None}}),
        ):
            with self.subTest(event=event, payload=payload), self.assertRaisesRegex(ValueError, "event payload"):
                workflow.check(event, payload, self.root)

    def test_invalid_event_json_has_concise_cli_diagnostic(self):
        event = self.root / "event.json"
        event.write_text("{broken", encoding="utf-8")
        env = dict(os.environ, GITHUB_EVENT_PATH=str(event), GITHUB_EVENT_NAME="push")
        result = subprocess.run(
            [sys.executable, str(Path(workflow.__file__).resolve())], cwd=self.root,
            env=env, text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR Cannot read GitHub event payload", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_missing_event_file_has_concise_cli_diagnostic(self):
        env = dict(os.environ, GITHUB_EVENT_PATH=str(self.root / "missing.json"),
                   GITHUB_EVENT_NAME="push")
        result = subprocess.run(
            ["python3", str(Path(workflow.__file__).resolve())], cwd=self.root,
            env=env, text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR Cannot read GitHub event payload", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_existing_base_whitespace_does_not_fail_clean_push(self):
        self.commit("existing bad  \n")
        base = self.git("rev-parse", "HEAD").stdout.strip()
        (self.root / "other.md").write_text("clean addition\n", encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-qm", "clean addition")
        self.assertEqual(workflow.check("push", {"before": base}, self.root).returncode, 0)
        self.assertNotEqual(workflow.check("workflow_dispatch", {}, self.root).returncode, 0)
