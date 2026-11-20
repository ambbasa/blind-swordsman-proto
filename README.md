# 심안(SIMAN) — 눈을 감으면 보이는 검

조선 수묵 다크 판타지 2.5D 쿼터뷰 제스처 액션 게임입니다.  
Three.js 기반 3D 관절 뼈대·수묵 툰 셰이더와 Web Audio API 주파수 매핑 무당방울을 결합해, **심안의 원 안에서 한지 수묵 검술과 먹안개 너머 소리로 귀물을 베는 액션**을 구현합니다.

## 주요 특징
- **3D 수묵·한지 연출**: 3D 관절 뼈대 리그(`inkhero3d.js`, `inkmonsters3d.js`, `inkmodels3d.js`), 공통 종이 재질·월드 거리 먹안개(`cardstock.js`), 고정 아레나 수묵 기물(`inkarena.js`, `inkprops3d.js`)
- **청각 기반 '심안' 사운드**: 공용 오디오 버스(`audiobus.js`), 대금 5음계 BGM, 무늬별 주파수 무당방울(`hline` 2600Hz · `vline` 2950Hz · `vee` 3350Hz · `bolt` 3800Hz)
- **제스처 전투 & 메타 성장**: 일섬·제자리 탭 패링·참(斬) 필살기, **3막 12장** 캠페인(폐허의 도성 · 안개 산사 · 혈월의 나락), 도전 모드 3종, 무구 5종 · 유물 12종 · 도감 · 무늬 수련장

## 로컬 실행
외부 빌드 도구 없이 순수 ES 모듈로 실행할 수 있습니다.

```bash
python -m http.server 8080
# 브라우저에서 http://localhost:8080/v2/ 접속 (개발자 검수: /v2/?dev=1)
```

## 테스트
```bash
node tests/unit/modules.test.mjs
```

## 프로젝트 구조
- `v2/`: 플레이 가능한 게임 본체 (`index.html`, `css/`, `js/`, `js/modules/`, `vendor/`)
- `docs/`: 버전별 설계 문서 및 실플레이 QA 리포트
- `tests/`: 제스처 인식기 및 도메인 순수 모듈 단위 테스트
