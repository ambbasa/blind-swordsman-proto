"""Batch watertight weld + Smooth-by-Angle (45 deg) repair for static scenery GLBs in v2/assets/models/props/."""
import math
import os
from pathlib import Path
import bmesh
import bpy

PROPS_DIR = Path(__file__).resolve().parents[2] / "v2" / "assets" / "models" / "props"


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for col in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.actions):
        for item in list(col):
            if item.users == 0:
                col.remove(item)


def repair_prop_glb(glb_path: Path):
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        return 0, 0, 0, 0

    b_before_tot = 0
    b_after_tot = 0
    v_before_tot = 0
    v_after_tot = 0
    sharp_rad = math.radians(45.0)

    for obj in meshes:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        v_before_tot += len(bm.verts)
        b_before_tot += sum(1 for e in bm.edges if e.is_boundary)
        # Weld split UV-seam vertices & micro-cracks while keeping loop UVs intact
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0015)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        v_after_tot += len(bm.verts)
        b_after_tot += sum(1 for e in bm.edges if e.is_boundary)
        for f in bm.faces:
            f.smooth = True
        for e in bm.edges:
            if len(e.link_faces) == 2:
                ang = e.calc_face_angle(0.0)
                e.smooth = ang < sharp_rad
            else:
                e.smooth = False
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()

    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.select_set(True)

    tmp_out = glb_path.with_suffix(".tmp.glb")
    bpy.ops.export_scene.gltf(
        filepath=str(tmp_out),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_yup=True,
        export_image_format="WEBP" if bpy.app.version >= (4, 0, 0) else "AUTO",
    )
    os.replace(tmp_out, glb_path)
    return v_before_tot, v_after_tot, b_before_tot, b_after_tot


def main():
    glbs = sorted(PROPS_DIR.glob("*.glb"))
    print(f"[repair_scenery_props] Repairing {len(glbs)} prop GLBs in {PROPS_DIR}")
    tot_b0 = 0
    tot_b1 = 0
    for idx, p in enumerate(glbs, 1):
        vb, va, bb, ba = repair_prop_glb(p)
        tot_b0 += bb
        tot_b1 += ba
        if idx <= 5 or idx == len(glbs) or bb != ba:
            print(f"  [{idx:02d}/{len(glbs)}] {p.name:24s} verts {vb:5d}->{va:5d}  boundary {bb:5d}->{ba:5d}")
    print(f"[repair_scenery_props] DONE! Total boundary edges: {tot_b0:,} -> {tot_b1:,}")


if __name__ == "__main__":
    main()
