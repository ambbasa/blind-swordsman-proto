"""Build any Ember carved character with the same 66-joint fitting and skinning pipeline."""
import argparse
import json
from pathlib import Path
import struct
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import apply_mesh2motion as m2m
from build_bosses_act234 import BOSS_CONFIGS, MODELS_DIR, UNARMED_ACTIONS, build_character


def character_profiles():
    profiles = {}
    for profile in m2m.CHARACTERS:
        name = profile["name"]
        if name == "boss":
            continue
        fit = profile["fit"]
        profiles[name] = {
            **profile,
            "id": name, "label": name, "mesh_prefix": name.capitalize(),
            "raw": f"{name}_raw.glb", "out": f"{name}.glb",
            "template": str(Path(MODELS_DIR) / f"{name}.glb"),
            "source_fit": fit,
            "clip_names": [clip for clip, _ in profile["clips"]],
            "torso_clean_z": fit["z_shoulder"] - 0.12,
            "torso_clean_x": fit["shoulder_x"] * 0.8,
            "arm_floor_z": fit["z_shoulder"] - fit["arm_len"] - 0.10,
            "tri_budget": {"hero": 15000, "minion": 9000, "heavy": 11000, "stone": 11000}[name],
        }

    bosses = {boss["id"]: boss for boss in BOSS_CONFIGS}
    for name, boss in bosses.items():
        # The shipped Act 1 template is still the older polearm boss. Act 2
        # already contains the curated unarmed set the boss builder produces.
        donor = bosses["boss_act2"] if name == "boss_act1" else boss
        profiles[name] = {
            **boss,
            "template": str(Path(MODELS_DIR) / donor["out"]),
            "source_fit": donor["fit"],
            "clip_names": [spec[0] for spec in UNARMED_ACTIONS],
        }

    # All meshes are normalized to 1.72 before fitting. Bound the wrist search
    # around hand height, not the widest point on a long robe, crown or pauldron.
    for profile in profiles.values():
        fit = profile["fit"]
        wrist_z = fit["z_shoulder"] - fit["arm_len"]
        profile["wrist_band"] = (max(0.40, wrist_z - 0.12), min(1.16, wrist_z + 0.24))
    return profiles


def verify_export(path, profile):
    """Check the exported GLB, not just Blender's pre-export scene."""
    with path.open("rb") as stream:
        magic, version, length, size, chunk = struct.unpack("<4sIII4s", stream.read(20))
        if (magic, version, chunk) != (b"glTF", 2, b"JSON") or length != path.stat().st_size:
            raise ValueError(f"Invalid GLB header: {path}")
        data = json.loads(stream.read(size))

    clips = {a["name"] for a in data.get("animations", []) if a.get("channels")}
    missing = set(profile["clip_names"]) - clips
    if missing:
        raise ValueError(f"Missing exported animation clips: {sorted(missing)}")

    prefix = profile.get("mesh_prefix", "Boss")
    meshes = {n["name"]: n for n in data["nodes"] if "mesh" in n}
    required = [prefix + "_Body", prefix + "_Outline"]
    if profile.get("keep_sword"):
        required.extend(["Hero_Sword", "Hero_Sword_Outline"])
    elif any(part in name.lower() for name in meshes for part in ("weapon", "sword", "club")):
        raise ValueError(f"Unexpected weapon in unarmed {profile['id']} export")

    skeleton = None
    for name in required:
        node = meshes.get(name)
        if node is None or "skin" not in node:
            raise ValueError(f"Missing skinned mesh: {name}")
        joints = set(data["skins"][node["skin"]]["joints"])
        if len(joints) != 66 or (skeleton is not None and skeleton != joints):
            raise ValueError(f"{name} must use the same 66 joints as the body")
        skeleton = joints
        for primitive in data["meshes"][node["mesh"]]["primitives"]:
            if not {"JOINTS_0", "WEIGHTS_0"}.issubset(primitive["attributes"]):
                raise ValueError(f"Missing exported vertex weights: {name}")


def main():
    profiles = character_profiles()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", required=True, choices=profiles)
    parser.add_argument("--raw-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--guardian", action="store_true", help="Fit horizontal arms and spread legs")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    args.out_dir.mkdir(parents=True, exist_ok=True)
    profile = profiles[args.only]
    if args.guardian:
        profile["guardian"] = True
        profile["wrist_band"] = (1.03, 1.52)
    with tempfile.TemporaryDirectory(dir=args.out_dir) as temp:
        staged = Path(temp) / profile["out"]
        build_character(profile, args.raw_dir, temp, carved=True)
        verify_export(staged, profile)
        destination = args.out_dir / profile["out"]
        staged.replace(destination)
        print(f"[VERIFIED] {destination}")


if __name__ == "__main__":
    main()
