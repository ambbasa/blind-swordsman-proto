"""
scripts/blender/export_for_mesh2motion.py
기존 5종 GLB(hero, minion, heavy, stone, boss)에서 구형 뼈대·외곽선·검을 제거하고,
Mesh2Motion(https://mesh2motion.org/)에 바로 드래그앤드롭할 수 있는 깨끗한 A-포즈 원본 GLB 5종을
`scripts/blender/_mesh2motion_in/` 폴더에 일괄 출력합니다.

PC 실행 명령어:
  blender --background --python scripts/blender/export_for_mesh2motion.py
"""
import os
import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
IN_DIR = os.path.join(ROOT, "v2", "assets", "models")
OUT_DIR = os.path.join(ROOT, "scripts", "blender", "_mesh2motion_in")
MODELS = ["hero", "minion", "heavy", "stone", "boss"]


def clean_and_export(name):
    src = os.path.join(IN_DIR, f"{name}.glb")
    if not os.path.isfile(src):
        print(f"[SKIP] {src} not found")
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)

    # Remove old armature, outline hulls, and attached swords so Mesh2Motion auto-rigs a pure clean body mesh
    to_remove = []
    for obj in list(bpy.data.objects):
        low = obj.name.lower()
        if obj.type == "ARMATURE" or "outline" in low or "sword" in low:
            to_remove.append(obj)
        elif obj.type == "MESH":
            # Clear Armature modifiers & old vertex groups so mesh stays cleanly in Rest A-pose
            for mod in list(obj.modifiers):
                if mod.type == "ARMATURE":
                    obj.modifiers.remove(mod)
            obj.vertex_groups.clear()
            obj.parent = None
            obj.matrix_world = obj.matrix_world.copy()

    for obj in to_remove:
        bpy.data.objects.remove(obj, do_unlink=True)

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"{name}_clean.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_animations=False,
        export_skins=False,
        export_yup=True,
    )
    print(f"[OK] Exported Mesh2Motion-ready GLB -> {out_path} ({os.path.getsize(out_path):,} bytes)")


def main():
    for name in MODELS:
        clean_and_export(name)
    print("\n[DONE] scripts/blender/_mesh2motion_in/ 의 *_clean.glb 파일을 https://mesh2motion.org 에 바로 올려 리깅하세요.")


if __name__ == "__main__":
    main()
