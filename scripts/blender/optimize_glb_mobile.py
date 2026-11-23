"""
scripts/blender/optimize_glb_mobile.py
모바일 로딩 경량화:
1) 애니메이션에서 변화 없는 상수 scale 채널 및 비-루트 상수 translation 채널 제거 (버퍼 대폭 절감)
2) 내장 JPEG/PNG 텍스처를 WebP(EXT_texture_webp, quality=82)로 재압축
3) 미사용 bufferView/accessor를 정리해 GLB 바이너리 재패킹 (Three.js r170 100% 네이티브 호환)
"""
import io
import json
import os
import struct
import glob
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS_DIR = os.path.join(ROOT, "v2", "assets", "models")


def read_accessor_floats(g, bin_data, acc_idx):
    acc = g["accessors"][acc_idx]
    if acc.get("componentType") != 5126:  # FLOAT
        return None
    bv = g["bufferViews"][acc["bufferView"]]
    comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[acc["type"]]
    cnt = acc["count"]
    off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = bv.get("byteStride") or (comps * 4)
    vals = []
    for i in range(cnt):
        pos = off + i * stride
        vals.append(struct.unpack_from(f"<{comps}f", bin_data, pos))
    return vals


def is_constant_vec3(vals, target=None, eps=1e-4):
    if not vals:
        return True
    ref = target if target is not None else vals[0]
    for v in vals:
        if abs(v[0] - ref[0]) > eps or abs(v[1] - ref[1]) > eps or abs(v[2] - ref[2]) > eps:
            return False
    return True


def optimize_glb(path):
    orig_size = os.path.getsize(path)
    data = open(path, "rb").read()
    jlen = struct.unpack("<I", data[12:16])[0]
    g = json.loads(data[20:20 + jlen])
    bin_off = 20 + jlen + 8
    bin_data = data[bin_off:]

    # 1) Strip constant scale (1,1,1) channels & constant non-root/pelvis translation channels
    removed_ch = 0
    for anim in g.get("animations", []):
        kept_channels = []
        used_samplers = set()
        for ch in anim.get("channels", []):
            tgt = ch.get("target", {})
            tpath = tgt.get("path")
            smp_idx = ch["sampler"]
            smp = anim["samplers"][smp_idx]
            if tpath == "scale":
                vals = read_accessor_floats(g, bin_data, smp["output"])
                if vals is not None and is_constant_vec3(vals, (1.0, 1.0, 1.0), 1e-3):
                    removed_ch += 1
                    continue
            elif tpath == "translation":
                node_idx = tgt.get("node")
                nname = g["nodes"][node_idx].get("name", "") if node_idx is not None else ""
                if nname not in ("root", "pelvis", "Hips"):
                    vals = read_accessor_floats(g, bin_data, smp["output"])
                    if vals is not None and is_constant_vec3(vals, None, 2e-4):
                        removed_ch += 1
                        continue
            kept_channels.append(ch)
            used_samplers.add(smp_idx)

        # Compact samplers for this animation
        old_to_new = {}
        new_samplers = []
        for idx in sorted(used_samplers):
            old_to_new[idx] = len(new_samplers)
            new_samplers.append(anim["samplers"][idx])
        for ch in kept_channels:
            ch["sampler"] = old_to_new[ch["sampler"]]
        anim["channels"] = kept_channels
        anim["samplers"] = new_samplers

    # 2) Convert embedded images to WebP (quality=82)
    webp_used = False
    img_blobs = {}
    for idx, img in enumerate(g.get("images", [])):
        bv_idx = img.get("bufferView")
        if bv_idx is None:
            continue
        bv = g["bufferViews"][bv_idx]
        off = bv.get("byteOffset", 0)
        raw = bin_data[off:off + bv["byteLength"]]
        try:
            im = Image.open(io.BytesIO(raw))
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGB")
            if max(im.size) > 1024:
                im.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            out_io = io.BytesIO()
            im.save(out_io, format="WEBP", quality=82, method=5)
            wb = out_io.getvalue()
            if len(wb) < len(raw):
                img_blobs[bv_idx] = wb
                img["mimeType"] = "image/webp"
                webp_used = True
        except Exception:
            pass

    if webp_used:
        for tex in g.get("textures", []):
            if "source" in tex:
                src_i = tex["source"]
                if g["images"][src_i].get("mimeType") == "image/webp":
                    tex.setdefault("extensions", {})["EXT_texture_webp"] = {"source": src_i}
        used_ext = g.setdefault("extensionsUsed", [])
        if "EXT_texture_webp" not in used_ext:
            used_ext.append("EXT_texture_webp")

    # 3) Garbage-collect unreferenced accessors & bufferViews and repack binary buffer
    used_acc = set()
    for m in g.get("meshes", []):
        for prim in m.get("primitives", []):
            if "indices" in prim:
                used_acc.add(prim["indices"])
            for v in prim.get("attributes", {}).values():
                used_acc.add(v)
    for sk in g.get("skins", []):
        if "inverseBindMatrices" in sk:
            used_acc.add(sk["inverseBindMatrices"])
    for anim in g.get("animations", []):
        for smp in anim.get("samplers", []):
            used_acc.add(smp["input"])
            used_acc.add(smp["output"])

    acc_map = {}
    new_accs = []
    for i, acc in enumerate(g.get("accessors", [])):
        if i in used_acc:
            acc_map[i] = len(new_accs)
            new_accs.append(acc)

    for m in g.get("meshes", []):
        for prim in m.get("primitives", []):
            if "indices" in prim:
                prim["indices"] = acc_map[prim["indices"]]
            for k, v in list(prim.get("attributes", {}).items()):
                prim["attributes"][k] = acc_map[v]
    for sk in g.get("skins", []):
        if "inverseBindMatrices" in sk:
            sk["inverseBindMatrices"] = acc_map[sk["inverseBindMatrices"]]
    for anim in g.get("animations", []):
        for smp in anim.get("samplers", []):
            smp["input"] = acc_map[smp["input"]]
            smp["output"] = acc_map[smp["output"]]
    g["accessors"] = new_accs

    used_bv = set()
    for acc in new_accs:
        if "bufferView" in acc:
            used_bv.add(acc["bufferView"])
    for img in g.get("images", []):
        if "bufferView" in img:
            used_bv.add(img["bufferView"])

    bv_map = {}
    new_bvs = []
    new_bin = bytearray()
    for i, bv in enumerate(g.get("bufferViews", [])):
        if i not in used_bv:
            continue
        while len(new_bin) % 4 != 0:
            new_bin.append(0)
        new_off = len(new_bin)
        if i in img_blobs:
            blob = img_blobs[i]
        else:
            off = bv.get("byteOffset", 0)
            blob = bin_data[off:off + bv["byteLength"]]
        new_bin.extend(blob)
        nbv = dict(bv)
        nbv["buffer"] = 0
        nbv["byteOffset"] = new_off
        nbv["byteLength"] = len(blob)
        bv_map[i] = len(new_bvs)
        new_bvs.append(nbv)

    for acc in new_accs:
        if "bufferView" in acc:
            acc["bufferView"] = bv_map[acc["bufferView"]]
    for img in g.get("images", []):
        if "bufferView" in img:
            img["bufferView"] = bv_map[img["bufferView"]]

    while len(new_bin) % 4 != 0:
        new_bin.append(0)
    g["bufferViews"] = new_bvs
    g["buffers"] = [{"byteLength": len(new_bin)}]

    jbytes = json.dumps(g, separators=(",", ":")).encode("utf-8")
    while len(jbytes) % 4 != 0:
        jbytes += b" "
    total = 12 + 8 + len(jbytes) + 8 + len(new_bin)
    with open(path, "wb") as f:
        f.write(b"glTF" + struct.pack("<II", 2, total))
        f.write(struct.pack("<I", len(jbytes)) + b"JSON" + jbytes)
        f.write(struct.pack("<I", len(new_bin)) + b"BIN\x00" + bytes(new_bin))

    new_size = os.path.getsize(path)
    pct = (1.0 - new_size / max(1, orig_size)) * 100.0
    print(f"  {os.path.basename(path):11s}: {orig_size/1e6:.2f} MB -> {new_size/1e6:.2f} MB (-{pct:.1f}%, stripped {removed_ch} const channels)")
    return orig_size, new_size


def main():
    tot_old = tot_new = 0
    for p in sorted(glob.glob(os.path.join(MODELS_DIR, "*.glb"))):
        o, n = optimize_glb(p)
        tot_old += o
        tot_new += n
    print(f"TOTAL: {tot_old/1e6:.2f} MB -> {tot_new/1e6:.2f} MB (-{(1 - tot_new/tot_old)*100:.1f}%)")


if __name__ == "__main__":
    main()
