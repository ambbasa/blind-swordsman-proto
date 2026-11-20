"""tools/skin3d/extract.py — 2D 원화(v2/assets/diorama/poses/*_idle.png)에서 3D 캐릭터용 텍스처 아틀라스를 굽는다.

    python tools/skin3d/extract.py            (저장소 루트에서 실행)

출력: v2/assets/diorama/skin3d/atlas.png (4x4 칸, 칸당 128px) + atlas.json (칸별 평균색).

칸은 두 종류다.
  tile  — 옷감·피부·바위 같은 '결'. 원화 조각을 좌우·상하로 거울 반복해 이음매 없이 감긴다.
  decal — 얼굴·가면·가슴처럼 한 번만 붙이는 그림. 원화 조각을 그대로 담는다(배경은 평균색으로 메운다).

저장 값은 색이 아니라 **평균색 대비 비율**(선형 공간, 0.5 = 평균과 같음)이다. 셰이더가 정점색(=평균색)에
이 비율×2 를 곱하므로, 원화의 색·명암이 3D 표면에 그대로 살아난다(v2/js/inkbody3d.js ART 참조).
좌표는 미터다: x = 캐릭터 중심선 기준 좌우, y = 발바닥 기준 높이 (원화 한 칸의 키 = manifest 의 m).
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
POSES = os.path.join(ROOT, 'v2', 'assets', 'diorama', 'poses')
OUT = os.path.join(ROOT, 'v2', 'assets', 'diorama', 'skin3d')
CELL = 128
GRID = 4

# (이름, 캐릭터, 종류, x0, x1, y0, y1) — 순서가 곧 칸 번호(zone = 8 + 번호)
CELLS = [
    ('heroCloth', 'hero', 'tile', -0.12, 0.14, 0.66, 0.92),
    ('heroFace', 'hero', 'decal', 0.03, 0.26, 1.96, 2.25),
    ('minionCloth', 'minion', 'tile', -0.22, 0.04, 0.74, 1.00),
    ('minionFace', 'minion', 'decal', 0.03, 0.33, 1.84, 2.20),
    ('heavySkin', 'heavy', 'tile', 0.46, 0.64, 1.86, 2.08),
    ('heavyFace', 'heavy', 'decal', -0.07, 0.19, 2.38, 2.70),
    ('heavyStraw', 'heavy', 'tile', -0.20, 0.08, 1.02, 1.30),
    ('heavyTorso', 'heavy', 'decal', -0.24, 0.18, 1.74, 2.34),
    ('stoneRock', 'stone', 'tile', 0.52, 0.86, 1.52, 1.90),
    ('stoneFace', 'stone', 'decal', -0.50, -0.04, 1.74, 2.40),
    ('bossRobe', 'boss', 'tile', 0.50, 0.90, 1.35, 1.90),
    ('bossMask', 'boss', 'decal', -0.27, 0.27, 4.42, 5.12),
    ('bossTrim', 'boss', 'tile', 0.26, 0.44, 1.55, 1.95),
    ('bossInner', 'boss', 'tile', -0.32, 0.04, 1.15, 1.60),
    ('wood', 'heavy', 'tile', 0.36, 0.60, 2.62, 2.84),
    ('heavyPants', 'heavy', 'tile', -0.22, -0.02, 0.68, 0.88),
]


def srgb_to_lin(v):
    v /= 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def lin_to_srgb(v):
    v = max(0.0, min(1.0, v))
    return 255.0 * (v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055)


def load_char(man, name):
    ch = man['chars'][name]
    w, h = ch['cell']
    im = Image.open(os.path.join(POSES, name + '_idle.png')).convert('RGBA').crop((0, 0, w, h))
    im = im.crop(im.getbbox())
    return im, im.height / ch['m']


def main():
    man = json.load(open(os.path.join(POSES, 'manifest.json'), encoding='utf-8'))
    os.makedirs(OUT, exist_ok=True)
    atlas = Image.new('RGB', (CELL * GRID, CELL * GRID), (128, 128, 128))
    meta = {'cell': CELL, 'grid': GRID, 'zoneBase': 8, 'cells': {}}
    cache = {}
    for i, (name, char, kind, x0, x1, y0, y1) in enumerate(CELLS):
        if char not in cache:
            cache[char] = load_char(man, char)
        im, ppm = cache[char]
        box = (int(round(im.width / 2 + x0 * ppm)), int(round(im.height - y1 * ppm)),
               int(round(im.width / 2 + x1 * ppm)), int(round(im.height - y0 * ppm)))
        crop = im.crop(box)
        px = list(crop.getdata())
        solid = [p for p in px if p[3] > 200]
        if not solid:
            print('!! empty cell', name, box)
            sys.exit(1)
        mean = [sum(srgb_to_lin(p[c]) for p in solid) / len(solid) for c in range(3)]
        # 평균 대비 비율(선형). 그림자가 툰 음영과 겹쳐 너무 꺼지지 않게 0.85 제곱으로 살짝 눌러 담는다.
        ratio = Image.new('RGB', crop.size)
        data = []
        for p in px:
            if p[3] <= 200:
                data.append((128, 128, 128))
                continue
            data.append(tuple(int(max(0, min(255, round(((srgb_to_lin(p[c]) / max(1e-4, mean[c])) ** 0.85) * 127.5))))
                              for c in range(3)))
        ratio.putdata(data)
        cell = Image.new('RGB', (CELL, CELL))
        if kind == 'tile':
            half = ratio.resize((CELL // 2, CELL // 2), Image.LANCZOS)
            cell.paste(half, (0, 0))
            cell.paste(half.transpose(Image.FLIP_LEFT_RIGHT), (CELL // 2, 0))
            cell.paste(cell.crop((0, 0, CELL, CELL // 2)).transpose(Image.FLIP_TOP_BOTTOM), (0, CELL // 2))
        else:
            cell = ratio.resize((CELL, CELL), Image.LANCZOS)
        atlas.paste(cell, ((i % GRID) * CELL, (i // GRID) * CELL))
        hexc = '#%02x%02x%02x' % tuple(int(round(lin_to_srgb(m))) for m in mean)
        meta['cells'][name] = {'i': i, 'zone': 8 + i, 'kind': kind, 'mean': hexc,
                               'rect': [x0, x1, y0, y1], 'from': char}
        print('%-12s zone %2d %-5s mean %s  %dx%d' % (name, 8 + i, kind, hexc, crop.width, crop.height))
    atlas.save(os.path.join(OUT, 'atlas.png'))
    json.dump(meta, open(os.path.join(OUT, 'atlas.json'), 'w', encoding='utf-8'), indent=1)
    print('->', os.path.join(OUT, 'atlas.png'))


if __name__ == '__main__':
    main()
