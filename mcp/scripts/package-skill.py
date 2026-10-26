"""Package only the portable skill files; never copy a user's installed skills."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[2]
name = "roamorrow-nomad-planner"
skill = root / "skills" / name
target = root / "mcp" / "public" / "skills" / (name + ".zip")
target.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
    for relative in ("SKILL.md", "references/usage.md", "scripts/query.mjs"):
        info = zipfile.ZipInfo(name + "/" + relative, date_time=(2026, 10, 26, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        bundle.writestr(info, (skill / relative).read_bytes())
    info = zipfile.ZipInfo(name + "/LICENSE", date_time=(2026, 10, 26, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    bundle.writestr(info, (root / "LICENSE").read_bytes())
print(target.relative_to(root))
