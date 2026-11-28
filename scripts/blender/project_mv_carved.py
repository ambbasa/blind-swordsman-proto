"""Orthographic 4-view 2D turnaround texture projection + bold carved facet cleanup.

Projects the original crisp RGBA 4-view concept images (front/back/left/right.png)
directly onto a normalized H=1.72m character mesh's UV map using 1-sample Cycles
world-position & world-normal EMIT bakes + vectorized numpy blending, falling back
smoothly to the existing Hunyuan3D texture only in occluded pockets (armpits, inner
thighs, undersides).
"""
import os
from pathlib import Path
import numpy as np
import bpy


def _find_base_color_image(mesh_obj):
    mat = mesh_obj.data.materials[0] if mesh_obj.data.materials else None
    if not mat or not mat.use_nodes:
        return None, None
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image is not None:
            return mat, n.image
    return mat, None


def _bake_geom_map(mesh_obj, kind, size=1024):
    """Bake 32-bit float world Position or Normal map onto mesh_obj's UV via 1-sample EMIT."""
    scene = bpy.context.scene
    prev_engine = scene.render.engine
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 8

    img = bpy.data.images.new(f"_tmp_{kind}", width=size, height=size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"

    orig_mats = list(mesh_obj.data.materials)
    mat = bpy.data.materials.new(f"_tmp_{kind}_mat")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    emit = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.select = True
    nt.nodes.active = tex

    if kind == "POS":
        # Encode world pos (x in [-1.5,1.5], y in [-1.5,1.5], z in [-0.5,2.5]) into [0,1]
        vmath_add = nt.nodes.new("ShaderNodeVectorMath")
        vmath_add.operation = "ADD"
        vmath_add.inputs[1].default_value = (1.5, 1.5, 0.5)
        vmath_mul = nt.nodes.new("ShaderNodeVectorMath")
        vmath_mul.operation = "SCALE"
        vmath_mul.inputs["Scale"].default_value = 1.0 / 3.0
        nt.links.new(geom.outputs["Position"], vmath_add.inputs[0])
        nt.links.new(vmath_add.outputs["Vector"], vmath_mul.inputs[0])
        nt.links.new(vmath_mul.outputs["Vector"], emit.inputs["Color"])
    else:
        # Encode world normal [-1,1] -> [0,1]
        vmath_mul = nt.nodes.new("ShaderNodeVectorMath")
        vmath_mul.operation = "SCALE"
        vmath_mul.inputs["Scale"].default_value = 0.5
        vmath_add = nt.nodes.new("ShaderNodeVectorMath")
        vmath_add.operation = "ADD"
        vmath_add.inputs[1].default_value = (0.5, 0.5, 0.5)
        nt.links.new(geom.outputs["Normal"], vmath_mul.inputs[0])
        nt.links.new(vmath_mul.outputs["Vector"], vmath_add.inputs[0])
        nt.links.new(vmath_add.outputs["Vector"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])

    mesh_obj.data.materials.clear()
    mesh_obj.data.materials.append(mat)
    bpy.ops.object.select_all(action="DESELECT")
    mesh_obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_obj
    bpy.ops.object.bake(type="EMIT")

    arr = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    arr = arr.reshape((size, size, 4))[..., :3]
    if kind == "POS":
        arr = arr * 3.0 - np.array([1.5, 1.5, 0.5], dtype=np.float32)
    else:
        arr = arr * 2.0 - 1.0
        nlen = np.linalg.norm(arr, axis=-1, keepdims=True)
        arr = np.where(nlen > 1e-5, arr / np.maximum(nlen, 1e-5), 0.0)

    mesh_obj.data.materials.clear()
    for om in orig_mats:
        mesh_obj.data.materials.append(om)
    bpy.data.materials.remove(mat, do_unlink=True)
    bpy.data.images.remove(img, do_unlink=True)
    scene.render.engine = prev_engine
    return arr


def _load_view_rgba(path):
    img = bpy.data.images.load(str(path), check_existing=False)
    w, h = img.size[0], img.size[1]
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img, do_unlink=True)
    # Blender image pixels are bottom-up (row 0 = bottom, row h-1 = top)
    rgba = buf.reshape((h, w, 4))
    alpha = rgba[..., 3]
    # Support both transparent RGBA cutouts and solid-black RGB turnarounds (e.g. hero_mv)
    if float(alpha.min()) > 0.95:
        fg = rgba[..., :3].max(axis=-1) > 0.055
        # Erode foreground mask inward by 6px so anti-aliased black background fringes NEVER bleed onto 3D edges
        eroded = fg.copy()
        for _ in range(6):
            pad = np.pad(eroded, 1, mode="constant", constant_values=False)
            eroded = (
                pad[1:-1, 1:-1] & pad[:-2, 1:-1] & pad[2:, 1:-1]
                & pad[1:-1, :-2] & pad[1:-1, 2:]
            )
        rgba[..., 3] = eroded.astype(np.float32)
        mask = fg
    else:
        mask = alpha > 0.12
    ys, xs = np.where(mask)
    if len(xs) == 0:
        raise ValueError(f"Empty foreground mask in {path}")
    return rgba, (int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max()))


def _sample_bilinear(rgba, fx, fy):
    """Vectorized bilinear sample on bottom-up RGBA array (H, W, 4)."""
    h, w, _ = rgba.shape
    in_bounds = (fx >= 0.0) & (fx <= w - 1.0) & (fy >= 0.0) & (fy <= h - 1.0)
    x0 = np.clip(np.floor(fx).astype(np.int32), 0, w - 1)
    y0 = np.clip(np.floor(fy).astype(np.int32), 0, h - 1)
    x1 = np.clip(x0 + 1, 0, w - 1)
    y1 = np.clip(y0 + 1, 0, h - 1)
    wx = np.clip(fx - x0, 0.0, 1.0)[..., None]
    wy = np.clip(fy - y0, 0.0, 1.0)[..., None]
    c00 = rgba[y0, x0]
    c10 = rgba[y0, x1]
    c01 = rgba[y1, x0]
    c11 = rgba[y1, x1]
    out = (c00 * (1.0 - wx) + c10 * wx) * (1.0 - wy) + (c01 * (1.0 - wx) + c11 * wx) * wy
    out[~in_bounds] = 0.0
    return out


def project_4view_onto_mesh(mesh_obj, mv_dir, tex_size=1024, skip_side_arms=False, no_arm_mask=False):
    """Project crisp front/back/left/right.png onto mesh_obj's existing Base Color texture."""
    mv_dir = Path(mv_dir)
    mat, base_img = _find_base_color_image(mesh_obj)
    if base_img is None:
        print(f"  [WARN] No base color image on {mesh_obj.name}, skipping 4-view projection")
        return False

    # Temporarily smooth normals for clean, seamless view-weight blending during projection bake
    prev_smooth = [p.use_smooth for p in mesh_obj.data.polygons]
    for p in mesh_obj.data.polygons:
        p.use_smooth = True

    pos = _bake_geom_map(mesh_obj, "POS", size=tex_size)
    nrm = _bake_geom_map(mesh_obj, "NRM", size=tex_size)

    for p, sm in zip(mesh_obj.data.polygons, prev_smooth):
        p.use_smooth = sm

    # Read existing Hunyuan3D texture as occluded-pocket fallback
    bw, bh = base_img.size[0], base_img.size[1]
    if bw != tex_size or bh != tex_size:
        base_img.scale(tex_size, tex_size)
    fb_buf = np.empty(tex_size * tex_size * 4, dtype=np.float32)
    base_img.pixels.foreach_get(fb_buf)
    fallback = fb_buf.reshape((tex_size, tex_size, 4))

    # Mesh world bbox
    pts = np.array([mesh_obj.matrix_world @ v.co for v in mesh_obj.data.vertices], dtype=np.float32)
    xmin, ymin, zmin = pts.min(axis=0)
    xmax, ymax, zmax = pts.max(axis=0)
    dx = max(1e-4, float(xmax - xmin))
    dy = max(1e-4, float(ymax - ymin))
    dz = max(1e-4, float(zmax - zmin))

    # Normalized mesh coordinates in [0, 1]
    ux_front = (pos[..., 0] - xmin) / dx          # Front (-Y): character's right (-X) is image left (0)
    ux_back  = (xmax - pos[..., 0]) / dx          # Back  (+Y): character's left (+X) is image left (0)
    ux_right = (ymax - pos[..., 1]) / dy          # Right (-X): character's back (+Y) is image left (0), front (-Y) is right (1)
    ux_left  = (pos[..., 1] - ymin) / dy          # Left  (+X): character's front (-Y) is image left (0), back (+Y) is right (1)
    uz       = (pos[..., 2] - zmin) / dz          # Bottom (0) -> Top (1), matches Blender bottom-up image rows!

    views = [
        ("front", ux_front, np.maximum(0.0, -nrm[..., 1])),
        ("back",  ux_back,  np.maximum(0.0,  nrm[..., 1])),
        ("right", ux_right, np.maximum(0.0, -nrm[..., 0])),
        ("left",  ux_left,  np.maximum(0.0,  nrm[..., 0])),
    ]

    acc_rgb = np.zeros((tex_size, tex_size, 3), dtype=np.float32)
    acc_w = np.zeros((tex_size, tex_size, 1), dtype=np.float32)

    for vname, u_coord, ndot in views:
        vpath = mv_dir / f"{vname}.png"
        if not vpath.is_file():
            continue
        rgba, (ix0, ix1, iy0, iy1) = _load_view_rgba(vpath)
        fx = ix0 + u_coord * (ix1 - ix0)
        fy = iy0 + uz * (iy1 - iy0)
        samp = _sample_bilinear(rgba, fx, fy)
        alpha = samp[..., 3:4]
        # Only trust pixels well inside the opaque silhouette (alpha > 0.75) and facing the camera
        valid = (alpha > 0.75).astype(np.float32)
        if vname in ("left", "right") and not no_arm_mask:
            if skip_side_arms:
                # For 45-deg A-pose characters whose side turnarounds have arms hanging down over torso/hips,
                # restrict side projection to head/neck (uz > 0.80) and lower legs/boots (uz < 0.42) only.
                # Height-normalized uz matches hero H=1.72m (0.72/1.72=0.419, 1.38/1.72=0.802) at any scale.
                arm_occluded = (uz >= 0.42) & (uz <= 0.80)
            else:
                # Prevent outstretched T-pose fist in side views from stamping onto the inner ribcage
                x_mid = 0.5 * (xmin + xmax)
                arm_occluded = (np.abs(pos[..., 0] - x_mid) < 0.22 * dx) & (uz > 0.61) & (uz < 0.86)
            valid = valid * (~arm_occluded)[..., None].astype(np.float32)
        w = (ndot[..., None] ** 4.0) * valid * alpha
        acc_rgb += samp[..., :3] * w
        acc_w += w

    # Blend projected 2D turnaround with Hunyuan3D fallback smoothly in occluded/grazing areas
    proj_rgb = acc_rgb / np.maximum(acc_w, 1e-6)
    blend = np.clip((acc_w - 0.04) / 0.14, 0.0, 1.0)
    final_rgb = proj_rgb * blend + fallback[..., :3] * (1.0 - blend)

    # Dilate valid UV-island borders into empty gutters (12px) to prevent dark UV seam bleed on faces/limbs
    uv_mask = np.linalg.norm(nrm, axis=-1) > 0.1
    if uv_mask.any() and not uv_mask.all():
        dil_rgb = final_rgb.copy()
        cur = uv_mask.copy()
        for _ in range(12):
            if cur.all():
                break
            acc = np.zeros_like(dil_rgb)
            cnt = np.zeros(cur.shape, dtype=np.float32)
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
                wt = 1.0 if (dy == 0 or dx == 0) else 0.707
                sm = np.roll(np.roll(cur, dy, axis=0), dx, axis=1)
                si = np.roll(np.roll(dil_rgb, dy, axis=0), dx, axis=1)
                if dy == 1:
                    sm[0, :] = False
                elif dy == -1:
                    sm[-1, :] = False
                if dx == 1:
                    sm[:, 0] = False
                elif dx == -1:
                    sm[:, -1] = False
                acc += si * (sm[..., None] * wt)
                cnt += sm * wt
            fill = (~cur) & (cnt > 0)
            dil_rgb[fill] = acc[fill] / cnt[fill][..., None]
            cur = cur | fill
        final_rgb = dil_rgb

    out = np.ones((tex_size, tex_size, 4), dtype=np.float32)
    out[..., :3] = np.clip(final_rgb, 0.0, 1.0)
    base_img.pixels.foreach_set(out.ravel())
    base_img.pack()
    cov = float((blend > 0.5).mean() * 100.0)
    print(f"  + Projected crisp 4-view 2D turnaround ({mv_dir.name}) onto {mesh_obj.name} ({cov:.1f}% direct 2D coverage, 12px UV margin)")
    return True


def quadriflow_carved_retopo(high_obj, body_obj, target_quads=2600, tex_size=1024):
    """Retopologize a high-poly sculpt into clean curvature-aligned carved quads + fresh UV + fallback albedo."""
    # 1) Make watertight manifold via fine voxel remesh, then QuadriFlow into clean flowing quads
    bpy.ops.object.select_all(action="DESELECT")
    body_obj.select_set(True)
    bpy.context.view_layer.objects.active = body_obj

    vmod = body_obj.modifiers.new(name="PreVoxel", type="REMESH")
    vmod.mode = "VOXEL"
    vmod.voxel_size = 0.012
    bpy.ops.object.modifier_apply(modifier=vmod.name)

    # Ensure strictly manifold single-component mesh with consistent outward normals for QuadriFlow
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(body_obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    # Keep only the largest connected component (removes tiny floating voxel specks that make QuadriFlow bail)
    bm.verts.ensure_lookup_table()
    visited = set()
    comps = []
    for v in bm.verts:
        if v.index in visited:
            continue
        stack = [v]
        visited.add(v.index)
        comp = []
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for e in cur.link_edges:
                ov = e.other_vert(cur)
                if ov.index not in visited:
                    visited.add(ov.index)
                    stack.append(ov)
        comps.append(comp)
    if len(comps) > 1:
        comps.sort(key=len, reverse=True)
        to_del = [v for c in comps[1:] for v in c]
        bmesh.ops.delete(bm, geom=to_del, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(body_obj.data)
    bm.free()
    body_obj.data.update()

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.mesh.select_non_manifold()
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.fill_holes(sides=8)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.quadriflow_remesh(
        mode="FACES",
        target_faces=int(target_quads),
        use_preserve_sharp=False,
        use_preserve_boundary=False,
        use_mesh_symmetry=False,
    )

    # 2) Snap quad vertices snugly back onto high_obj silhouette (0mm silhouette accuracy)
    sw = body_obj.modifiers.new(name="SnapHigh", type="SHRINKWRAP")
    sw.target = high_obj
    sw.wrap_method = "NEAREST_SURFACEPOINT"
    bpy.ops.object.modifier_apply(modifier=sw.name)

    # 3) Clean Smart UV Project on the new quad topology
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.05, island_margin=0.012)
    bpy.ops.object.mode_set(mode="OBJECT")

    # 4) Create fresh material & bake high_obj's exact Base Color via EMIT as 100%-coverage fallback
    new_img = bpy.data.images.new(f"{body_obj.name}_CarvedAlbedo", width=tex_size, height=tex_size, alpha=False)
    new_mat = bpy.data.materials.new(name=f"{body_obj.name}_CarvedMat")
    new_mat.use_nodes = True
    nt = new_mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.78
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.25
    tex_node = nt.nodes.new("ShaderNodeTexImage")
    tex_node.image = new_img
    tex_node.select = True
    nt.nodes.active = tex_node
    # Note: link tex_node -> bsdf AFTER baking to avoid circular dependency!

    body_obj.data.materials.clear()
    body_obj.data.materials.append(new_mat)

    # Temporarily emit high_obj's Base Color image directly so metallic/grazing areas never bake black
    _, high_img = _find_base_color_image(high_obj)
    orig_high_mats = list(high_obj.data.materials)
    emit_mat = None
    if high_img is not None:
        emit_mat = bpy.data.materials.new(name="_tmp_HighEmit")
        emit_mat.use_nodes = True
        ent = emit_mat.node_tree
        ent.nodes.clear()
        htex = ent.nodes.new("ShaderNodeTexImage")
        htex.image = high_img
        hemit = ent.nodes.new("ShaderNodeEmission")
        hout = ent.nodes.new("ShaderNodeOutputMaterial")
        ent.links.new(htex.outputs["Color"], hemit.inputs["Color"])
        ent.links.new(hemit.outputs["Emission"], hout.inputs["Surface"])
        high_obj.data.materials.clear()
        high_obj.data.materials.append(emit_mat)

    scene = bpy.context.scene
    prev_engine = scene.render.engine
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.045
    scene.render.bake.max_ray_distance = 0.08
    scene.render.bake.margin = 12

    bpy.ops.object.select_all(action="DESELECT")
    high_obj.select_set(True)
    body_obj.select_set(True)
    bpy.context.view_layer.objects.active = body_obj
    bpy.ops.object.bake(type="EMIT" if emit_mat is not None else "DIFFUSE")
    new_img.pack()

    if emit_mat is not None:
        high_obj.data.materials.clear()
        for om in orig_high_mats:
            high_obj.data.materials.append(om)
        bpy.data.materials.remove(emit_mat, do_unlink=True)

    nt.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
    scene.render.engine = prev_engine

    for p in body_obj.data.polygons:
        p.use_smooth = False
    tris = sum(len(p.vertices) - 2 for p in body_obj.data.polygons)
    print(f"  + QuadriFlow Carved Retopo OK: {len(body_obj.data.polygons)} quads (~{tris} tris) + UV baked!")
    return new_img

