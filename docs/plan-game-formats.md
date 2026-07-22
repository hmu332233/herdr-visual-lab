# 플랜: 게임 포맷 플러그인화(B) + 레이드 보스 포맷(A)

2026-07-22 작성. 시작 전 검토용.

## 목표

서버가 내려보내는 presentation을 게임 중립으로 만들고(B), 클라이언트 게임 포맷을
모듈로 분리해 F1을 첫 포맷으로 이식한 뒤, 두 번째 포맷으로 **레이드 보스**를
추가한다(A). 최종 상태:

- 같은 서버 세션을 `?game=f1` 탭과 `?game=raid` 탭이 동시에 관전할 수 있다.
- 서버·프로토콜은 게임 어휘를 모른다. 포맷 추가는 `src/web/formats/<name>/`
  디렉터리 하나로 끝난다.
- Phase B 완료 시점의 F1 화면은 현재와 픽셀 단위로 동일하다(리팩터링 검증 기준).

## 현재 구조 요약 (조사 결과)

- 서버 시뮬레이션(`race-session.ts`)은 이미 사실상 중립적이다: 누적 진행량
  `official`, 구간별 페이스 배수, 완주 임계치(`RaceRules.totalLaps = 58`),
  페이즈 전환뿐이다. F1인 부분은 어휘와 `present()`/`rankedTeams()`가 만드는
  사전 포맷 문자열(`statusText`, `distanceText`, `gapText`)이 전부다.
- 클라이언트는 `main.ts`(조립) → `chrome.ts`(헤더·오버레이·포디움),
  `standings.ts`(팀 패널), `track.ts`(캔버스 씬)로 나뉜다. 셋 모두 F1 어휘를
  포함하지만, `palette.ts`/`geometry.ts`/`state.ts`는 중립 유틸이다.
- 테스트 15개 파일 중 `race-session-*.test.ts` 3개가 F1 문자열과 placement
  kind를 단언한다. 나머지는 영향 없음.

---

## Phase B — 프레젠테이션 중립화 + 포맷 모듈화

동작 무변경 리팩터링. 이 페이즈가 끝나면 F1 화면·문구·모션이 지금과 동일해야 한다.

### B1. `src/shared/presentation.ts` 중립 어휘로 교체

| 현재 | 변경 | 비고 |
| --- | --- | --- |
| `RacePresentation` | `GamePresentation` | |
| `RacePhase` `awaitingGrid / live / podium` | `GamePhase` `awaitingUnits / live / results` | |
| `EntryPlacement` `track / pit / cooldown / incidentTrack / incidentPit / retired / nextGrid` | `active / resting / coolingDown / blockedActive / blockedResting / departed / queued` | 의미 구조는 1:1 유지 |
| `RaceOverlay` `formationLap / noCarsOnGrid / redFlag / suspended` | `GameOverlay` `connecting / noUnits / frozen / suspended` | |
| `carNumber` | `unitNumber` | 부여 로직 무변경 |
| `officialDistance` | `officialProgress` | 단위: 진행 유닛(현 1랩 = 1유닛) |
| `PodiumResult` / `PodiumTeam` | `FinalResult` / `FinalResultTeam` | `grandPrix` → `round` |
| `statusText`, `lap` | **삭제** | `officialProgress`에서 클라이언트가 유도 |
| `headerLap` | **삭제** | 리더 진행량에서 유도 (`leaderProgress` 필드로 대체) |
| `distanceText`, `gapText` | **삭제** | 원시 `progress`(합계)만 유지 |

유지: `AgentStatus`(herdr 권위 상태 그대로), `displaySpeed`, `colorToken`,
`isFocused`, `showsNewStint`, 팀 그룹핑, focus 프로토콜.

### B2. `src/shared/rules.ts` 신설 (클라이언트 포맷 계산용 상수)

`gapText`의 초 환산(`baseLapDuration`)과 랩 유도(`totalLaps`)가 클라이언트로
가므로, 서버 전용 `server/rules.ts`에서 다음 상수를 공유 모듈로 옮긴다:

- `progressTarget` (= 58, 현 `totalLaps`)
- `baseProgressDuration` (현 `baseLapDuration`)

`server/rules.ts`는 이를 re-export해서 시뮬레이션 코드는 그대로 쓴다.

### B3. 서버 `race-session.ts` 최소 수정

- `present()`에서 문자열 생성 제거, placement kind만 중립 이름으로 방출.
- `rankedTeams()`에서 `distanceText`/`gapText` 제거.
- **내부 변수명(`carNumber`, `lap`, `grandPrix`, 파일명 등)은 건드리지 않는다.**
  외부 계약만 중립화해 diff를 줄이고 시뮬레이션 회귀 위험을 0에 가깝게 한다.

### B4. 클라이언트 포맷 인터페이스와 F1 이식

```
src/web/
  main.ts            # 소켓, 포맷 선택(?game=), 조립 — 중립
  format.ts          # GameFormat 인터페이스 — 신설
  state.ts, palette.ts, geometry.ts   # 중립 유틸 (placement kind만 개명 반영)
  formats/
    f1/
      index.ts       # GameFormat 구현
      vocabulary.ts  # statusText/lap/gap/header 유도 — 서버에서 옮긴 로직 그대로
      track.ts       # 현 track.ts 이동
      standings.ts   # 현 standings.ts 이동
      chrome.ts      # 현 chrome.ts 이동
    raid/            # Phase A에서 추가
```

```ts
interface GameFormat {
  createChrome(): { render(sync: SyncMessage): void };
  createStandings(el: HTMLElement, onFocus: (id: string) => void): { render(sync): void };
  createScene(canvas: HTMLCanvasElement, onFocus: (id: string) => void): {
    setSync(sync, receivedAtMs): void; frame(nowMs): void; resize(): void;
  };
}
```

- 포맷 선택: `main.ts`에서 `new URLSearchParams(location.search).get('game')`,
  기본값 `f1`. 서버 플래그 없음 — 탭마다 다른 포맷으로 같은 세션 관전 가능.
- `index.html`의 F1 고정 문구(`LAP 1 / 58`, `CONSTRUCTORS` 등)는 비우고 포맷의
  chrome이 채운다. 컨테이너 구조는 공용 유지.
- `vocabulary.ts`는 서버 `present()`에서 삭제한 로직을 **그대로 옮긴** 순수
  함수 집합: `statusText(entry)`, `lapOf(progress)`, `distanceText(progress)`,
  `gapText(leader, team)`, `headerLap(leaderProgress)`.

### B5. 테스트 이동·수정

- `race-session-*.test.ts`: placement kind를 새 이름으로, 문자열 단언
  (`'LAP 2'`, `'2.0 LAPS'`, `'+1.5s'` 등)은 원시값 단언으로 교체
  (`officialProgress`, `leaderProgress`, 팀 `progress`).
- `tests/formats-f1-vocabulary.test.ts` 신설: 삭제된 문자열 단언을 순수 함수
  테스트로 이곳에 복원. 서버 테스트에서 지운 케이스와 1:1 대응시켜 커버리지
  손실이 없음을 보장.
- `state.test.ts`: placement kind 개명만 반영.

### B6. Phase B 완료 기준

1. `npm run test`, `npm run typecheck`, `npm run build` 전부 통과.
2. `herdr-f1 start --fixture <name> --no-open`으로 띄운 F1 화면이 리팩터링 전과
   시각·문구 동일 (fixture 3종 육안 비교).
3. `grep -r "LAP\|PIT\|GRID" src/server src/shared`에 걸리는 게임 어휘 0건.

---

## Phase A — 레이드 보스 포맷 (`formats/raid/`)

Phase B의 중립 데이터를 재해석만 한다. 서버·프로토콜·shared 무변경.

### 데이터 매핑 (확정)

| 중립 데이터 | 레이드 해석 |
| --- | --- |
| `officialProgress` | 누적 데미지 (1유닛 = 1스택) |
| `leaderProgress / progressTarget` | 보스 HP 게이지 = `1 - 비율` — 완주 판정(선두 58 도달)과 정확히 일치 |
| `round` (구 grandPrix) | STAGE 번호 — 격파할수록 다음 보스 |
| placement `active` | 보스 주위 궤도에서 공격, 떠오르는 데미지 숫자 |
| `resting` | 하단 캠프(모닥불)에서 휴식 |
| `coolingDown` | 승리 포즈로 궤도 순회 (`displaySpeed` 그대로 사용) |
| `blockedActive` / `blockedResting` | 스턴 디버프 아이콘 + 점멸 (현 incident 점멸 재사용) |
| `queued` | 대기 벤치, `NEXT WAVE` 태그 |
| `departed` | 씬에서 제거 (F1과 동일 정책) |
| phase `results` + `FinalResult` | `BOSS DOWN` 연출 + 길드 MVP 패널 |
| overlay `connecting / noUnits / frozen / suspended` | `SUMMONING / NO RAIDERS / TIME FREEZE / RAID SUSPENDED` |
| 팀 순위 패널 | DPS 미터: 길드별 누적 데미지 바 차트 |
| focus 클릭 | 해당 레이더 타겟팅 → herdr 터미널 포커스 (동일 프로토콜) |

### 씬 설계

- 중앙 보스: 단순 도형 몬스터 + 상단 대형 HP 바(`leaderProgress` 기반),
  HP 구간별 색 변화. 격파 임박(90%+) 시 점멸.
- 레이더 궤도: `progress`(placement의 fractional 값)를 보스 중심 원궤도 각도로
  변환 — F1의 `extrapolateProgress` 보간을 그대로 재사용한다.
- 공격 연출: `active` 마커에서 보스로 향하는 투사체 + 데미지 숫자 파티클.
  발생 빈도는 `displaySpeed`에 비례 (빠른 에이전트 = 높은 DPS로 보임).
- 캠프: F1 pit lane에 해당하는 하단 존. 팀별 슬롯·캐스케이드 배치 로직은
  F1 track.ts의 pit 배치를 참고하되 코드는 raid 씬에 새로 작성.
- 재사용: `palette.ts`(팀 색·상태 색), `state.ts`(보간), 마커 겹침 분산
  아이디어. 캔버스 씬 자체는 새로 작성 (`geometry.ts`의 서킷 폴리라인은 불필요).

### 테스트

- `tests/formats-raid-vocabulary.test.ts`: HP 비율, 상태 라벨, DPS 텍스트 등
  순수 함수 단위 테스트 (F1 vocabulary 테스트와 같은 패턴).
- 씬 렌더링은 기존 F1 track.ts와 동일하게 테스트 비대상 (수동 fixture 확인).

### Phase A 완료 기준

1. `?game=raid`로 fixture 3종 육안 확인: 상태 전환(공격↔캠프↔스턴), 보스 HP
   감소, 격파 → STAGE 증가, DPS 미터 순위.
2. F1 탭과 raid 탭 동시 접속 시 서로 간섭 없음.
3. 신규 vocabulary 테스트 포함 전체 테스트 통과.

---

## 작업 순서와 커밋 단위

1. **B1+B2+B3** — shared 중립화 + 서버 문자열 제거 + 서버 테스트 수정 (1커밋)
2. **B4+B5** — 클라이언트 `formats/f1/` 이식 + vocabulary 테스트 (1커밋)
3. B6 검증 후 **A** — `formats/raid/` + 테스트 (1~2커밋)
4. README에 포맷 선택(`?game=`) 문서화 (마지막 커밋에 포함)

## 리스크

- **B의 유일한 실질 위험은 문자열 로직 이식 누락.** 서버 테스트에서 지우는
  단언과 vocabulary 테스트에 넣는 단언을 1:1로 맞추는 것으로 방어한다.
- `index.html` 초기 정적 문구가 사라지므로 첫 sync 전 빈 헤더가 보일 수 있음
  → 포맷 chrome 생성 시점에 초기 문구를 즉시 채운다.
- 레이드 씬의 파티클 양이 많아지면 저사양에서 프레임 저하 가능 → F1 smoke처럼
  파티클 수 상한을 둔다.

## 이 플랜에서 하지 않는 것

- 서버 내부 변수·파일명 개명 (`race-session.ts`, `grandPrix` 등) — 2차 정리로 미룸.
- 포맷별 서버 시뮬레이션 분기 — 시뮬레이션은 단일, 해석만 포맷별.
- CLI 이름(`herdr-f1`)·패키지명 변경 — 별도 결정 사항.
