#!/usr/bin/env python3
"""인식 회귀 시험 (v0.29 §2.3).

같은 시드의 합성 획 모음(corpus.js)을 현재 인식기(gestures.js)에 넣고 혼동 행렬을 만든다.
`baseline.json`과 다르면 실패한다(기준선을 바꾸려면 --update로 일부러 다시 커밋해야 한다).
수용 기준(§2.1)도 함께 잰다.

    python3 tests/unit/gestures/run.py            # 검사
    python3 tests/unit/gestures/run.py --update   # 기준선 다시 쓰기(의도한 변경일 때만)
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
GESTURES = os.path.join(REPO, 'v2', 'js', 'gestures.js')
CORPUS = os.path.join(HERE, 'corpus.js')
BASELINE = os.path.join(HERE, 'baseline.json')
CHROME = os.environ.get('QA_CHROME', '/workspace/.cache/chs/chrome-headless-shell-linux64/chrome-headless-shell')
LIBS = os.environ.get('QA_LIBS', '/workspace/tool-results/libs/root/usr/lib/x86_64-linux-gnu')

LABELS = ['vline', 'hline', 'vee', 'circle', 'square', 'bolt', 'tri', 'arc', 'spiral', 'tap', 'none']
SHAPES = ['vline', 'hline', 'vee', 'circle', 'square', 'bolt', 'tri', 'arc', 'spiral', 'tap']

# §2.1 수용 기준
THRESHOLDS = {
    'lineAsBoltMax': 0.01,     # 가로선·세로선 → 번개 1% 이하
    'narrowBoltMin': 0.90,     # 폭 20px 번개 90% 이상 유지
    'circleMin': 0.85,         # 동그라미 인식률 85% 이상 유지
}


def run_matrix(gesture_js, corpus_js):
    from playwright.sync_api import sync_playwright
    env = dict(os.environ)
    if os.path.isdir(LIBS):
        env['LD_LIBRARY_PATH'] = LIBS
    with sync_playwright() as p:
        kw = {'args': ['--no-sandbox', '--disable-dev-shm-usage']}
        if os.path.exists(CHROME):
            kw['executable_path'] = CHROME
        b = p.chromium.launch(**kw, env=env)
        pg = b.new_page()
        pg.set_content('<!doctype html><meta charset="utf-8"><body></body>')
        pg.add_script_tag(content=corpus_js)
        pg.add_script_tag(content=gesture_js)
        out = pg.evaluate("""() => {
          const TOTEM = ['tri', 'arc', 'spiral'];
          const rows = GPCorpus.makeCorpus({});
          const res = rows.map((s, i) => {
            // 기물 무늬(△ ◡ @)는 보스전에서만 겨룬다(opts.totem) — 그 조건 그대로 잰다.
            const opt = TOTEM.indexOf(s.shape) >= 0 ? { allowBolt: true, totem: true } : { allowBolt: true };
            const r = GPGestures.recognize(s.pts, opt);
            return { i, shape: s.shape, narrow: !!s.narrow, jitter: s.jitter, size: s.size, rot: s.rot,
                     got: r.type || 'none', best: r.best || null, score: +(r.bestScore || 0).toFixed(4),
                     reason: r.reason || null };
          });
          return { n: rows.length, res };
        }""")
        b.close()
    return out


def aggregate(out):
    matrix = {s: {l: 0 for l in LABELS} for s in SHAPES}
    narrow = {'n': 0, 'bolt': 0}
    for r in out['res']:
        matrix[r['shape']][r['got']] = matrix[r['shape']].get(r['got'], 0) + 1
        if r['narrow']:
            narrow['n'] += 1
            if r['got'] == 'bolt':
                narrow['bolt'] += 1
    return matrix, narrow


def metrics(matrix, narrow):
    tot = {s: sum(matrix[s].values()) for s in SHAPES}
    rate = lambda s, k: (matrix[s][k] / tot[s]) if tot[s] else 0.0
    line_n = tot['vline'] + tot['hline']
    line_bolt = matrix['vline']['bolt'] + matrix['hline']['bolt']
    return {
        'vlineAsBolt': round(rate('vline', 'bolt'), 4),
        'hlineAsBolt': round(rate('hline', 'bolt'), 4),
        'lineAsBolt': round(line_bolt / max(1, line_n), 4),
        'circleRate': round(rate('circle', 'circle'), 4),
        'boltRate': round(rate('bolt', 'bolt'), 4),
        'narrowBoltRate': round(narrow['bolt'] / max(1, narrow['n']), 4),
        'veeRate': round(rate('vee', 'vee'), 4),
        'squareRate': round(rate('square', 'square'), 4),
        'tapRate': round(rate('tap', 'tap'), 4),
        'totemRates': {k: round(rate(k, k), 4) for k in ('tri', 'arc', 'spiral')},
    }


def compare(base, now):
    diffs = []
    for s in SHAPES:
        for l in LABELS:
            a = base['matrix'].get(s, {}).get(l, 0)
            b = now['matrix'].get(s, {}).get(l, 0)
            if a != b:
                diffs.append({'shape': s, 'as': l, 'baseline': a, 'now': b})
    return diffs


def check_thresholds(m):
    fails = []
    if m['lineAsBolt'] > THRESHOLDS['lineAsBoltMax']:
        fails.append('가로선·세로선 → 번개 %.1f%% (기준 1%% 이하)' % (m['lineAsBolt'] * 100))
    if m['narrowBoltRate'] < THRESHOLDS['narrowBoltMin']:
        fails.append('좁은 번개(폭 20px) 인식률 %.1f%% (기준 90%% 이상)' % (m['narrowBoltRate'] * 100))
    if m['circleRate'] < THRESHOLDS['circleMin']:
        fails.append('동그라미 인식률 %.1f%% (기준 85%% 이상)' % (m['circleRate'] * 100))
    return fails


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--update', action='store_true')
    ap.add_argument('--verbose', action='store_true')
    ap.add_argument('--gestures', default=None, help='다른 인식기 파일로 재기(비교용)')
    ap.add_argument('--by-jitter', action='store_true', help='흔들림 단계별 결과도 출력')
    a = ap.parse_args()
    with open(a.gestures or GESTURES, encoding='utf-8') as f:
        gj = f.read()
    with open(CORPUS, encoding='utf-8') as f:
        cj = f.read()
    out = run_matrix(gj, cj)
    matrix, narrow = aggregate(out)
    m = metrics(matrix, narrow)
    now = {'version': 'v0.29', 'n': out['n'], 'matrix': matrix, 'narrow': narrow, 'metrics': m}

    print('획 %d개 (무늬 %d종)' % (out['n'], len(SHAPES)))
    head = '%-7s' % '' + ''.join('%8s' % l for l in LABELS)
    print(head)
    for s in SHAPES:
        print('%-7s' % s + ''.join('%8d' % matrix[s][l] for l in LABELS))
    print(json.dumps(m, ensure_ascii=False, indent=None))
    if a.by_jitter:
        per = {}
        for r in out['res']:
            k = '%s|j%d' % (r['shape'], r['jitter'])
            per.setdefault(k, {})
            per[k][r['got']] = per[k].get(r['got'], 0) + 1
        for k in sorted(per):
            print('%-16s %s' % (k, dict(sorted(per[k].items(), key=lambda kv: -kv[1]))))

    fails = check_thresholds(m)
    if a.update:
        now['generatedAt'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
        now['seed'] = 20261129
        now['thresholds'] = THRESHOLDS
        with open(BASELINE, 'w', encoding='utf-8') as f:
            json.dump(now, f, ensure_ascii=False, indent=1, sort_keys=True)
            f.write('\n')
        print('baseline 갱신:', BASELINE)
        if fails:
            print('주의: 수용 기준 미달 —', '; '.join(fails))
            return 1
        return 0

    if not os.path.exists(BASELINE):
        print('baseline.json이 없습니다. --update로 만드세요.')
        return 2
    with open(BASELINE, encoding='utf-8') as f:
        base = json.load(f)
    diffs = compare(base, now)
    if fails:
        print('FAIL — 수용 기준 미달:')
        for x in fails:
            print('  -', x)
    if diffs:
        print('FAIL — 기준선과 혼동 행렬이 다릅니다 (%d칸):' % len(diffs))
        for d in diffs[:20]:
            print('  - %s → %s : %d → %d' % (d['shape'], d['as'], d['baseline'], d['now']))
        print('  의도한 변경이면 `python3 tests/unit/gestures/run.py --update`로 기준선을 갱신해 커밋하세요.')
    if not fails and not diffs:
        print('PASS — 수용 기준 충족, 기준선과 일치')
        return 0
    return 1


if __name__ == '__main__':
    sys.exit(main())
