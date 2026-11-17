# 인식 회귀 시험 (제스처)

『심안』의 무늬 인식기(`v2/js/gestures.js`)가 조용히 나빠지지 않게 잡는 시험이다.
v0.29 §2.3에서 도입했다.

## 무엇을 재나

- `corpus.js`: 합성 획 생성기. 무늬 10종 × 손 떨림 3단계(3·6·9px) × 크기 3단계(90·124·160px)
  × 기울기 5단계(-20°~+20°), 고정 시드(20261129) + 폭 20px 좁은 번개 60개 = **획 510개**.
  손 떨림은 점마다의 잡음이 주고, 획 전체가 한 번 완만하게 휘는 것이 부다.
- `run.py`: 획을 인식기에 넣어 **혼동 행렬**을 만들고 `baseline.json`과 칸마다 비교한다.
  한 칸이라도 다르면 실패한다. 기준선을 바꾸려면 `--update`로 일부러 다시 만들어 커밋해야 한다.
- `baseline.json`: 마지막으로 승인한 혼동 행렬과 v0.29 §2.1의 수용 기준.

## 수용 기준 (§2.1)

| 항목 | 기준 | v0.28 | v0.29 |
|---|---|---|---|
| 가로선·세로선 → 번개 | 1% 이하 | 6.7% | **0%** |
| 좁은 번개(폭 20px) 인식 | 90% 이상 | 100% | **98.3%** |
| 동그라미 인식 | 85% 이상 | 86.7% | **86.7%** |

## 돌리는 법

```bash
python3 tests/unit/gestures/run.py              # 검사 (실패 시 exit 1)
python3 tests/unit/gestures/run.py --update     # 기준선 다시 쓰기(의도한 변경일 때만)
python3 tests/unit/gestures/run.py --gestures /path/to/old/gestures.js   # 다른 판과 비교
python3 tests/unit/gestures/run.py --by-jitter  # 떨림 단계별 결과
```

필요한 것: Python 3 + `playwright` (Chromium). 브라우저 경로는 `QA_CHROME`,
라이브러리 경로는 `QA_LIBS` 환경 변수로 바꿀 수 있다.

CI: `ci-workflow.yml`이 푸시마다 `playwright install chromium` 뒤 이 시험을 돌리는 워크플로다.
**아직 `.github/workflows/`에 넣지 못했다** — 저장소에 연결된 GitHub App 토큰에 `workflows`
권한이 없어 푸시가 거부됐다. 저장소 설정에서 Actions를 켠 뒤 아래처럼 한 번 복사해 커밋하면 된다.

```bash
mkdir -p .github/workflows && cp tests/unit/gestures/ci-workflow.yml .github/workflows/gestures.yml
```

> 왜 Vitest가 아닌가: 설계안 §2.3은 `tests/unit/gestures/`(Vitest)를 적었지만, 이 저장소에는
> 빌드 도구(Node/npm)가 없고 GitHub Pages에 그대로 올리는 정적 사이트다. 같은 시험(같은 생성기·
> 같은 기준선·같은 수용 기준)을 이미 쓰고 있는 Playwright로 돌린다. 나중에 Node를 들이면
> `corpus.js`를 그대로 Vitest에서 불러 쓸 수 있게 UMD로 두었다.

## 아직 없는 것

- **실제 손 획 모음**: 설계안은 사람이 무늬마다 직접 그린 획을 JSON으로 모으라고 적었다.
  아직 없어서 `real/` 폴더만 만들어 두었다. 모이면 `real/*.json`(형식: `[{shape, pts:[{x,y}]}]`)을
  두고 `run.py`가 합성 획과 함께 잰다.
