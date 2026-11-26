#!/usr/bin/env python3
"""Bump cache-busting version (?v=vXXX and siman-vXXX) across v2/ and run verification checks.

Usage:
    python3 scripts/bump_version.py v154
    python3 scripts/bump_version.py v154 --sync-stale
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
V2 = ROOT / "v2"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version", help="Target version tag, e.g. v154")
    parser.add_argument("--sync-stale", action="store_true", help="Also update older pinned ?v=v0XX tags")
    parser.add_argument("--skip-tests", action="store_true", help="Skip node --check and unit tests")
    args = parser.parse_args()

    ver = args.version.strip()
    if not re.fullmatch(r"v\d+", ver):
        raise SystemExit(f"Invalid version format: {ver} (expected e.g. v154)")

    # Detect current main cache version from v2/sw.js
    sw_path = V2 / "sw.js"
    sw_txt = sw_path.read_text(encoding="utf-8")
    m = re.search(r"siman-(v\d+)", sw_txt)
    if not m:
        raise SystemExit("Could not find siman-vXXX in v2/sw.js")
    old_ver = m.group(1)

    targets = [V2 / "index.html", sw_path] + sorted((V2 / "js").rglob("*.js"))
    updated = []
    stale = []
    for path in targets:
        txt = path.read_text(encoding="utf-8")
        if args.sync_stale:
            new_txt = re.sub(r"\?v=v\d+", f"?v={ver}", txt)
            new_txt = re.sub(r"siman-v\d+", f"siman-{ver}", new_txt)
        else:
            new_txt = txt.replace(f"?v={old_ver}", f"?v={ver}").replace(f"siman-{old_ver}", f"siman-{ver}")
        if new_txt != txt:
            path.write_text(new_txt, encoding="utf-8")
            updated.append(str(path.relative_to(ROOT)))
        # Check remaining older ?v= tags
        rem = sorted(set(re.findall(r"\?v=v\d+", new_txt)) - {f"?v={ver}"})
        if rem:
            stale.append((str(path.relative_to(ROOT)), rem))

    print(f"[bump_version] {old_ver} -> {ver}: updated {len(updated)} files")
    if stale:
        print(f"[bump_version] Note: {len(stale)} files still have older pinned ?v= tags:")
        for fp, tags in stale:
            print(f"  - {fp}: {tags}")

    # Check runtime CJK (hanja) in v2/js/
    cjk_hits = []
    for path in sorted((V2 / "js").rglob("*.js")):
        raw = path.read_text(encoding="utf-8", errors="ignore")
        no_c = re.sub(r"/\*[\s\S]*?\*/|//.*", "", raw)
        found = re.findall(r"[\u4E00-\u9FFF]", no_c)
        if found:
            cjk_hits.append((str(path.relative_to(ROOT)), len(found)))
    if cjk_hits:
        print("[ERROR] CJK hanja detected in runtime JS:", cjk_hits)
        sys.exit(1)
    print("[bump_version] Runtime CJK check: 0 violations")

    if not args.skip_tests:
        check_files = [
            "v2/js/game.js",
            "v2/js/inkarena.js",
            "v2/js/inkchunks.js",
            "v2/js/glbprops.js",
            "v2/js/glbboss.js",
            "v2/js/glbhero.js",
            "v2/js/modules/combatEngine.js",
            "v2/js/modules/levelUpUi.js",
            "v2/js/modules/uiMotion.js",
        ]
        existing = [f for f in check_files if (ROOT / f).is_file()]
        subprocess.run(["node", "--check"] + existing, cwd=ROOT, check=True)
        print(f"[bump_version] node --check PASSED ({len(existing)} files)")
        res = subprocess.run(["node", "tests/unit/modules.test.mjs"], cwd=ROOT, check=True, text=True, capture_output=True)
        for line in res.stdout.strip().splitlines()[-5:]:
            print(" ", line)


if __name__ == "__main__":
    main()
