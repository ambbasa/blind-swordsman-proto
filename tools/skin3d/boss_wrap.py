"""Bake the turnaround into per-surface wraps. Dimensions are source-image pixels.
Each cross section registers silhouette bounds in BOTH orthographic drawings.
Do not project the profile across the torso where the near arm occludes it.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[2] / 'v2/assets/diorama/skin3d'
source = np.asarray(Image.open(OUT / 'boss-turnaround.png').convert('RGBA'))
parts = []
wraps = []


def part(name, chain, rows, *, side=False, back=True, width=384, reverse=1540):
    rows = np.array(rows, dtype=float)
    y = np.arange(rows[0, 0], rows[-1, 0] + 1)[:, None]
    left, right, near, far = [np.interp(y, rows[:, 0], rows[:, i]) for i in range(1, 5)]
    angle = np.linspace(0, 2 * np.pi, width)[None, :]
    s, c = np.sin(angle), np.cos(angle)
    # Interior samples only: the edge of a cutout contains antialias/background.
    x = (left + right) / 2 + .46 * (right - left) * s
    profile = (near + far) / 2 - .46 * (far - near) * c

    def sample(u):
        px = np.clip(u.astype(int), 0, source.shape[1]-1)
        return source[y.astype(int), px].astype(float)

    front = sample(x)
    rear = sample(reverse - x) if back else front
    profile_color = sample(profile)
    front_weight = np.clip(.5 + c / .46, 0, 1)
    side_weight = np.clip((.60 - abs(c)) / .39, 0, 1) if side else np.zeros_like(c)
    if name.startswith('leg'):
        # The hanging hand and cuffs cover the near thigh in the profile painting.
        uncovered = sample(831 + 8*(1-c))
        fade = np.clip((625-y)/35, 0, 1)[:,:,None]
        profile_color = profile_color*(1-fade) + uncovered*fade
    weights = [front_weight*(1-side_weight), (1-front_weight)*(1-side_weight), side_weight]
    colors = [front, rear, profile_color]
    weighted = [w * np.clip((col[:,:,3]-35)/130, 0, 1) for w,col in zip(weights,colors)]
    total = sum(weighted)
    pixels = sum(w[:,:,None]*col[:,:,:3] for w,col in zip(weighted,colors)) / np.maximum(total[:,:,None], .001)
    # Extend the nearest painted sample along each ring instead of sampling empty canvas.
    for row in range(len(y)):
        good = np.flatnonzero(total[row] > .12)
        if len(good):
            for ch in range(3):
                pixels[row,:,ch] = np.interp(np.arange(width), good, pixels[row,good,ch], period=width)
        elif row:
            pixels[row] = pixels[row-1]
        else:
            pixels[row] = (51,52,43)
    wraps.append(Image.fromarray(pixels.astype('uint8')))
    parts.append(dict(name=name,chain=chain,rows=rows.astype(int).tolist()))


part('mask','head',[(15,293,309,829,839),(22,282,320,818,851),(37,276,326,814,861),(48,280,327,815,853),(53,280,348,768,850),(66,265,362,752,856),(84,261,367,741,865),(103,259,371,738,863),(119,258,371,723,859),(129,259,371,732,856),(144,267,365,736,848),(155,284,354,731,837),(170,292,350,734,828),(182,303,343,754,832)],side=True,width=512,reverse=1548)
part('neck','chest head',[(148,293,344,766,826),(180,291,353,770,838),(215,281,356,765,849)])
part('jacket','pelvis chest',[(183,288,355,773,843),(202,259,378,769,848),(223,217,421,758,853),(239,207,432,747,862),(266,226,408,735,866),(310,232,401,720,858),(353,239,395,714,852),(376,246,388,718,850),(403,250,388,718,843),(429,245,395,712,848),(460,216,409,713,855),(490,207,417,711,864),(522,190,422,709,875),(541,184,428,708,868)],reverse=1544)
for tag in ['R','L']:
    right=tag=='R'
    armrows=([(227,198,234,779,823),(247,194,249,775,845),(280,182,246,739,815),(315,151,240,708,778),(341,142,234,696,766),(358,133,226,684,750),(377,131,218,679,738),(389,138,207,678,722),(401,138,190,678,709),(413,132,167,672,705),(419,119,145,667,695)]
          if right else [(229,400,438,787,830),(250,393,441,781,850),(285,397,452,767,862),(320,395,469,765,857),(355,401,493,765,857),(370,405,498,765,855),(390,415,495,766,852),(411,424,494,774,843),(431,438,500,780,836),(451,455,508,783,824),(480,480,518,779,816),(506,495,526,776,811),(524,497,530,771,810)])
    part('arm'+tag,'chest upper'+tag+' elbow'+tag+' hand'+tag,armrows,side=not right)
    handrows=([(379,98,124,647,673),(388,91,137,641,681),(406,86,137,638,681),(423,91,128,642,679),(430,99,124,647,673)]
             if right else [(505,502,525,776,809),(525,493,529,766,805),(545,487,534,755,797),(561,486,540,751,794),(578,484,533,752,792),(599,499,525,759,783),(612,501,513,759,772)])
    part('hand'+tag,'hand'+tag,handrows,side=True)
    pants=[(483,217,304,731,848),(535,198,299,734,861),(583,191,293,728,866),(626,194,294,732,853),(657,192,296,727,850),(682,187,291,725,852),(713,171,278,722,855),(731,175,279,728,861),(749,184,283,732,855),(780,190,263,753,841),(795,195,253,766,836),(814,180,248,768,838),(833,180,242,769,837),(859,189,235,774,832),(900,184,224,773,828),(936,176,219,760,827),(950,171,220,745,829),(965,155,224,715,834),(983,139,228,692,838),(996,136,228,690,838),(1002,144,212,695,829)]
    if not right:
        pants=[(y,640-b,640-a,n,f) for y,a,b,n,f in pants]
    part('leg'+tag,'pelvis thigh'+tag+' knee'+tag+' foot'+tag,pants,side=True)
part('sash','pelvis tail tip',[(411,325,349,716,731),(443,324,368,698,710),(500,318,372,699,710),(575,311,365,690,700),(652,304,357,693,703),(717,311,346,695,705),(747,307,333,700,709),(784,319,330,708,716),(803,318,322,709,713)],back=False,width=192)
part('goatee','head',[(145,304,339,734,758),(154,305,337,731,751),(170,310,333,730,746),(186,314,328,728,740),(200,316,324,726,735),(211,318,321,725,730)],side=True,back=False,width=96)
part('bell','staff',[(224,83,88,639,644),(236,82,89,637,646),(247,78,92,631,647),(259,70,95,623,648),(270,66,98,619,650),(277,68,95,621,648),(280,74,83,627,640)],back=False,width=96)
part('staffTie','staff',[(278,80,86,630,637),(298,77,91,627,640),(323,76,86,626,635),(346,74,82,624,632),(371,67,77,619,629),(405,63,73,615,625),(438,69,74,620,625),(450,72,74,623,625)],back=False,width=96)
part('shaft','staff',[(168,98,115,645,663),(182,91,121,638,671),(199,97,116,644,664),(217,98,116,646,664),(223,97,117,645,666),(239,101,115,648,664),(366,101,116,649,664),(435,101,117,649,664),(495,100,118,647,666),(502,98,119,646,667),(512,102,117,649,664),(909,102,117,649,664),(919,98,119,646,666),(944,100,117,649,663),(998,108,111,655,659)],side=True,width=96)
# Keep UV islands separated even under minification.
atlas = Image.new('RGB',(2048,2048))
x=y=height=0
for entry,wrap in zip(parts,wraps):
    w,h=wrap.size
    if x+w+8>atlas.width: x=0;y+=height;height=0
    if y+h+8>atlas.height: raise ValueError('UV atlas overflow')
    atlas.paste(Image.fromarray(np.pad(np.array(wrap),((4,4),(4,4),(0,0)),mode='edge')),(x,y))
    entry['uv']=[x+4,y+4,w,h]
    x+=w+8;height=max(height,h+8)
atlas.save(OUT/'boss-wrap.webp',quality=92,method=6)
(OUT/'boss-rig.json').write_text(json.dumps(parts,separators=(',',':')))

