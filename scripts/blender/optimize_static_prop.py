"""Normalize, decimate, ground-align, and export a static prop GLB for mobile Three.js."""
import argparse
import os
import sys
import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--in", dest="in_glb", required=True)
    p.add_argument("--out", dest="out_glb", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--height", type=float, default=3.2)
    p.add_argument("--tris", type=int, default=4500)
    return p.parse_args(argv)


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.in_glb)

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh objects imported from {args.in_glb}")

    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()

    obj = bpy.context.view_layer.objects.active
    obj.name = f"Prop_{args.name}"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Compute world-space bounding box and normalize height + ground center (x=0, y=0, min_z=0)
    verts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    xs = [v.x for v in verts]
    ys = [v.y for v in verts]
    zs = [v.z for v in verts]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    min_z, max_z = min(zs), max(zs)
    cur_h = max(1e-4, max_z - min_z)
    scale = args.height / cur_h
    cx = (min_x + max_x) * 0.5
    cy = (min_y + max_y) * 0.5

    for v in obj.data.vertices:
        v.co = Vector(((v.co.x - cx) * scale, (v.co.y - cy) * scale, (v.co.z - min_z) * scale))
    obj.data.update()

    # Decimate to mobile triangle budget while preserving UVs
    tri_count = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tri_count > args.tris:
        ratio = max(0.05, min(1.0, args.tris / float(tri_count)))
        dec = obj.modifiers.new(name="DecProp", type="DECIMATE")
        dec.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=dec.name)

    # Clean matte stylized shading
    for poly in obj.data.polygons:
        poly.use_smooth = True
    for mat in obj.data.materials:
        if mat and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    node.inputs["Roughness"].default_value = 0.86
                    node.inputs["Metallic"].default_value = 0.04

    os.makedirs(os.path.dirname(os.path.abspath(args.out_glb)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=args.out_glb,
        export_format="GLB",
        export_image_format="WEBP",
        export_image_quality=85,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_yup=True,
    )
    final_tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f"[PROP OK] {args.name}: {tri_count} -> {final_tris} tris, H={args.height}m -> {args.out_glb}")


if __name__ == "__main__":
    main()
