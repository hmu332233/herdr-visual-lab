# Herdr Metro 게임 기획

## 1. 한 줄 정의

Herdr 코딩 에이전트들을 심야 도시의 지하철 노선과 열차로 표현하는 실시간
제로플레이어 관전 게임.

각 workspace는 하나의 노선, agent terminal은 고유 번호를 가진 열차가 된다.
작업 중인 열차는 선형 노선의 양 끝 종착역을 왕복하고, 쉬는 열차는 차량기지에
머물며, 막힌 열차는 선로 위에서 신호 대기 상태가 된다.

진입 URL은 `?game=metro`를 사용한다.

## 2. 제품 목표

### 목표

- 여러 agent의 상태를 2~3초 안에 파악할 수 있어야 한다.
- 많은 agent가 동시에 움직일 때 도시 교통망이 살아나는 관전 재미를 제공한다.
- `blocked`와 focus를 다른 효과에 묻히지 않게 보여 준다.
- 직접 플레이하지 않아도 합류, 출발, 환승, 막차 같은 작은 사건이 계속 발생한다.
- 모든 브라우저 탭에서 같은 이벤트 저널로 결정론적인 장면을 재현한다.

### 하지 않을 것

- 실제 작업 진척도, 생산성, token 사용량, 완료 품질을 추정하지 않는다.
- workspace나 agent를 실제 성과 순으로 평가하지 않는다.
- 열차끼리 실제 충돌하거나 blocked가 다른 agent를 막게 하지 않는다.
- 실제 Herdr 상태를 게임 화면에서 변경하지 않는다.
- 실제 terminal 출력이나 코드 내용을 읽지 않는다.

## 3. 핵심 판타지

관전자는 심야 도시의 지하철 관제실을 보고 있다.

| Herdr | Metro |
| --- | --- |
| workspace | 지하철 노선 |
| agent terminal | 고유 번호를 가진 열차 |
| agent 번호 | 열차 편성 번호 |
| workspace 색 | 노선 색 |
| focus | 관제 카메라가 추적 중인 열차 |
| status 변화 | 운행 개시, 차량기지 복귀, 종착, 신호 정지 |
| 입장/퇴장 | 차량 출고와 입고 |
| 연결 상태 | 중앙 관제망 상태 |

Metro의 주인공은 순위가 아니라 도시 전체의 흐름이다.

## 4. 실제 신호 매핑

| Herdr 신호 | Metro 표현 | 이동 여부 | 관전 UI |
| --- | --- | --- | --- |
| `working` | `IN SERVICE` | 노선을 따라 정상 운행 | 밝은 전조등, 창문 점등, 승객 입자 |
| `idle` | `AT DEPOT` | 차량기지에서 정지 | 실내등 일부 소등, 충전 애니메이션 |
| `done` | `TERMINATED` | 가장 가까운 종착역까지 연출상 이동 후 정지 | 행선판 `SERVICE COMPLETE`, 문 개방 |
| `blocked` | `SIGNAL HOLD` 또는 `MAINTENANCE` | 즉시 정지 | 빨간 신호, 경고 링, 관제 패널 최상단 표시 |
| focused terminal | `TRACKING` | 원래 상태 유지 | 흰색 추적 링, 노선 강조, 이름표 고정 |
| agent 입장 | `ROLL OUT` | 차량기지 또는 터널에서 등장 | 출고 안내와 짧은 전조등 점등 |
| agent 퇴장 | `RETURNING` | 가까운 터널로 퇴장 | `OUT OF SERVICE` 행선판 |
| session restart | `NEW CREW` | 현재 위치 유지 | 운전실 조명 점멸, 짧은 라벨 |
| 연결 끊김 | `CONTROL SIGNAL LOST` | 전체 장면 동결 | 중앙 신호등 적색, 반투명 오버레이 |

### `blocked` 위치 규칙

`blocked` 진입 전 상태를 기억한다.

- `working → blocked`: 현재 선로 위치에서 멈춘다.
- `idle → blocked`: 차량기지 정비 칸에서 멈춘다.
- `done → blocked`: 종착역 또는 회송선에서 정비 상태가 된다.
- `blocked → working`: 빨간 신호가 녹색으로 바뀐 뒤 재출발한다.
- `blocked → idle`: 견인 연출 후 차량기지로 들어간다.

이 규칙으로 blocked가 항상 선로 사고처럼 과장되지 않게 한다.

## 5. 게임 루프

Metro는 승패형 레이스보다 반복되는 심야 운행 시뮬레이션으로 구성한다.

### 운행 사이클

1. `FIRST SERVICE`
   - working agent가 처음 생기면 야간 운행이 시작된다.
   - 차량기지 문이 열리고 열차가 각 노선으로 진입한다.
2. `NIGHT SERVICE`
   - 75초의 활성 운행 시간이다.
   - working agent가 하나 이상 있을 때만 운행 시간이 증가한다.
   - 전체 agent가 idle/done/blocked이면 `QUIET HOURS`로 일시 정지한다.
3. `LAST TRAIN`
   - 활성 운행 시간 마지막 10초다.
   - 하늘이 밝아지고 역 전광판에 막차 안내가 나온다.
   - 게임 규칙이나 이동 속도는 바꾸지 않는다.
4. `DAWN`
   - 8초 동안 도시 전체 조명이 천천히 꺼지고 첫차 준비 연출을 보여 준다.
   - 순위나 등급 없이 세션 한정의 허구 통계만 표시한다.
   - 이후 다음 `SERVICE NIGHT`가 시작된다.

### DAWN 카드

표시 가능한 정보:

- `TRAINS DISPATCHED`
- `STATIONS VISITED`
- `INTERCHANGE MOMENTS`
- `SERVICE NIGHT 04 COMPLETE`

표시하지 않을 정보:

- 최고의 agent
- 가장 생산적인 workspace
- blocked 횟수 순위
- agent별 작업 시간
- 실제 완료율처럼 보이는 백분율

모든 통계 아래에 다음 문구를 둔다.

> Fictional transit activity generated for spectatorship. Not a productivity
> metric.

## 6. 노선과 도시 생성

### 고정 도시 그래프

매 라운드마다 무작위로 선로가 바뀌면 위치 기억이 어려워지므로 기본 도시 구조는
고정한다.

- 논리 해상도: `960 × 540`
- 역: 16개
- 환승역: 중앙 1개, 보조 3개
- 선로 구간: 약 24개
- 차량기지: 화면 가장자리 4곳
- 배경: 심야 빌딩, 강, 공원, 도로
- 표현: 2D 탑다운 지하철 노선도와 작은 도시 풍경의 혼합

### workspace 노선 배정

- `stableOrder`를 기반으로 미리 준비한 노선 템플릿에 배정한다.
- 같은 workspace는 브라우저 재접속 후에도 같은 노선 형태와 색을 사용한다.
- workspace 이름이 바뀌어도 노선은 이동하지 않는다.
- 최대 12개 노선 템플릿을 제공한다.
- 12개를 초과하면 색뿐 아니라 실선, 이중선, 짧은 점선 패턴으로 구분한다.

### agent 위치

같은 노선의 열차는 unit number를 이용해 서로 다른 초기 phase를 갖는다.

```text
routeProgress = (officialDistance + unitPhase) % routeLength
```

`routeProgress`의 전반부는 한쪽 종착역으로 향하고 후반부는 같은 선로를 따라
돌아오는 왕복 구간이다. 마지막 역과 첫 역을 화면을 가로질러 직접 연결하지 않는다.

각 노선은 배정된 차량기지에서 약 100px 이내의 합류역을 반드시 지난다. 신규 또는
재출고 열차는 차량기지 문에서 점선 출고선을 따라 이 합류역으로 들어온 뒤 본선
운행을 시작한다.

열차 간격은 시각적으로만 분산한다. 앞 열차 때문에 뒷 열차가 멈추거나 agent 상태가
변하지는 않는다.

## 7. 실제 이동 규칙

### 공식 거리

`working`이면서 연결이 live일 때만 공식 거리가 증가한다.

```text
distance += elapsed * baseServiceSpeed * seededSpeed
```

- `seededSpeed`는 agent ID와 service night 번호로 결정한다.
- 권장 범위는 `0.92~1.08`이다.
- 속도 차이는 장면이 기계적으로 보이지 않게 만드는 용도다.
- 공식 순위에는 사용하지 않는다.

### 상태 전환 연출

`working → done`일 때 공식 거리는 즉시 멈춘다. 다만 시각적으로는 1~2초 동안
가까운 역까지 감속해 들어갈 수 있다.

이때 추가 이동은 `displayProgress`일 뿐 공식 거리나 통계에 반영하지 않는다.

`working → idle`은 다음과 같이 표현한다.

1. 가까운 분기점까지 감속
2. 회송 행선판 점등
3. 차량기지 방향 터널로 이동
4. 차량기지 슬롯에 정차

`blocked`는 보간 없이 이벤트가 발생한 선로 위치를 고정한다.

## 8. 화면 구성

```text
┌────────────────────────────────────────────┬──────────────────┐
│                                            │ NETWORK CONTROL  │
│          심야 도시 + 지하철 노선도         │                  │
│                                            │ Line A / workspace│
│       ●──────────────●                     │  #12 IN SERVICE   │
│       │    CENTRAL   │                     │  #18 AT DEPOT     │
│   DEPOT      ◎───────●                     │                  │
│       │      ↑ focused train               │ Line B / workspace│
│       ●──────────────●                     │  #21 SIGNAL HOLD  │
│                                            │                  │
├────────────────────────────────────────────┴──────────────────┤
│ SERVICE NIGHT 04 · NIGHT SERVICE · 7 TRAINS · SIGNAL LIVE     │
└───────────────────────────────────────────────────────────────┘
```

### 메인 장면

- 화면의 약 72%
- 노선도, 역, 차량기지, 열차, 승객 입자
- blocked 신호와 focus 추적 효과
- 현재 phase와 연결 상태

### 오른쪽 패널

기존 `standings` 영역을 `NETWORK CONTROL` 패널로 사용한다.

workspace 카드:

- 노선 색과 노선 기호
- workspace 이름
- 현재 운행 중인 열차 수
- 전체 agent 수
- blocked 존재 여부

agent 행:

- 열차 번호
- `tabLabel`
- `agentKind`
- 상태
- focus 여부

agent 정렬 순서:

1. focused
2. blocked
3. working
4. done
5. idle
6. unit number

workspace 카드의 순서는 `stableOrder`를 유지해 화면이 출렁이지 않게 한다.

## 9. 열차 표현

### 기본 형태

MVP에서는 외부 이미지 없이 Pixi `Graphics`로 그린다.

- 크기: 약 `26 × 12px`
- 앞뒤가 구분되는 전조등
- workspace 노선 색 차체
- 대비되는 번호 배지
- 작은 창문 3~4개
- 방향에 맞춰 회전

### 상태별 디테일

- `working`: 창문 전체 점등, 미세한 레일 불꽃, 역 정차 시 문 개방
- `idle`: 차량기지에서 호흡하듯 실내등 점멸
- `done`: 행선판을 금색 또는 흰색으로 바꾸고 종착역 정차
- `blocked`: 차체는 그대로 유지하고 주변 신호만 빨갛게 표시
- focus: 흰색 링, 해당 열차에서 panel까지 이어지는 얇은 추적선

blocked 열차 자체를 붉게 칠하면 노선 색과 소속을 잃으므로 차체 색은 유지한다.

## 10. 역과 승객

승객은 실제 task나 메시지를 뜻하지 않는 순수 관전용 요소다.

- 역마다 작은 빛 입자가 생성된다.
- working 열차가 도착하면 일부가 열차 안으로 흡수된다.
- 다음 역에서 다른 입자가 내린다.
- idle/done/blocked 열차에는 승객 흐름이 발생하지 않는다.
- 승객 수는 저장하거나 agent별 점수로 사용하지 않는다.

### 환승역 연출

서로 다른 노선의 working 열차가 중앙역에 비슷한 시간에 도착하면:

- 역 조명이 잠시 밝아진다.
- 승객 입자가 노선 사이를 이동한다.
- `INTERCHANGE`라는 작은 라벨이 나타난다.
- 부드러운 한 음을 재생할 수 있다.

열차의 실제 위치나 속도를 억지로 맞추지는 않는다. 자연스럽게 겹쳤을 때만
연출한다.

## 11. 관전 재미 훅

### 러시아워 펄스

약 18~25초마다 seed 기반으로 특정 역의 승객 조명이 많아진다. 결과나 점수에는
영향을 주지 않는다.

### 도시의 생활감

상태와 무관한 배경 사건을 낮은 확률로 발생시킨다.

- 옥상 고양이
- 다리 위를 지나는 야간 버스
- 강 위의 작은 배
- 역 앞 버스커
- 유성
- 새벽 청소차

### 중앙역 교차

여러 workspace의 열차가 중앙 환승역 부근을 동시에 지나면 카메라가 아주 약하게
줌아웃해 네트워크 전체를 보여 준다.

### 막차 연출

`LAST TRAIN` 동안:

- 역 시계가 강조된다.
- 배경 하늘이 남색에서 보랏빛으로 변한다.
- 열차 행선판이 더 밝아진다.
- 열차 속도나 agent 상태는 바꾸지 않는다.

### focus 추적

열차 또는 오른쪽 agent 행을 클릭하면:

1. 실제 terminal focus 요청 전송
2. 해당 열차 추적 링 표시
3. 노선의 나머지 부분을 약간 어둡게 처리
4. 열차 위에 `#번호 · tabLabel` 고정
5. 5초간 부드러운 카메라 추적

다른 terminal이 실제 focus되면 즉시 그 대상으로 전환한다.

## 12. 연결과 빈 화면 처리

| 상황 | 표현 |
| --- | --- |
| Herdr 대기 중 | `AWAITING CONTROL SIGNAL` |
| workspace 없음 | 불 꺼진 도시와 `NO LINES REGISTERED` |
| agent는 있으나 전부 idle | `QUIET HOURS · ALL TRAINS AT DEPOT` |
| 연결 끊김 | 마지막 프레임 동결, `CONTROL SIGNAL LOST` |
| 재연결 | 신호등이 적색→황색→녹색으로 바뀌며 같은 service night 계속 |
| 잘못된 `?game=` | 기존 규칙대로 F1 fallback |

연결이 끊긴 동안 열차 거리, phase, 승객 연출은 진행하지 않는다.

## 13. 게임 상태 모델 제안

```ts
interface MetroState {
  phase: 'awaiting' | 'service' | 'quiet' | 'dawn';
  serviceNight: number;
  timelineTime: number;
  timelineRate: number;
  activeServiceTime: number;
  dawnElapsed: number;
  connection: ConnectionState;
  hasSnapshot: boolean;
  lines: Map<string, MetroLineState>;
  trains: Map<string, MetroTrainState>;
}

interface MetroLineState {
  id: string;
  label: string;
  sourceOrder: number;
  stableOrder: number;
  routeTemplate: number;
  colorToken: TeamColorToken;
}

interface MetroTrainState {
  id: string;
  number: number;
  lineID: string;
  tabLabel: string;
  agentKind: string;
  status: AgentStatus;
  isFocused: boolean;

  officialDistance: number;
  displayDistance: number;
  speedSeed: number;

  departed: boolean;
  blockedAtDepot: boolean;
  previousStatus: AgentStatus;
  transitionStartedAt: number | null;
  restartedUntil: number | null;
}
```

### View 모델

```ts
type TrainPlacement =
  | { kind: 'route'; progress: number }
  | { kind: 'depot'; slot: number }
  | { kind: 'terminus'; station: number }
  | { kind: 'blocked-route'; progress: number }
  | { kind: 'maintenance'; slot: number }
  | { kind: 'departing'; progress: number };

interface MetroView {
  phase: 'awaitingUnits' | 'quietHours' | 'live' | 'dawn';
  serviceNight: number;
  lines: MetroLineView[];
  focusedTrainID: string | null;
  connection: ConnectionState;
  overlay: GameOverlay;
}
```

## 14. 코드 구조

```text
src/web/formats/metro/
├── index.ts          # GameFormat 조립
├── fold.ts           # 이벤트 fold와 시간 진행
├── view.ts           # 렌더링용 projection
├── rules.ts          # 속도, phase 길이, seed 규칙
├── routes.ts         # 도시 그래프와 노선 템플릿
├── choreography.ts   # 입출고, 역 정차, 감속 보간
├── scene.ts          # Pixi 장면
├── panel.ts          # NETWORK CONTROL 패널
├── chrome.ts         # 상단/하단 상태 표시
└── vocabulary.ts     # 상태와 안내 문구
```

필요한 기존 수정:

- `src/web/main.ts`: `metro: createMetroFormat` 등록
- `src/web/game-speed.ts`: `metro: 1` 등록
- `src/web/style.css`: `body[data-game='metro']` 레이아웃 추가
- `README.md`: 포맷 표와 `?game=metro` 예제 추가
- 테스트: fold, route, projection, choreography, URL selection

### 렌더러 선택

Pixi 사용을 권장한다.

- 노선과 열차를 개별 interactive node로 관리하기 쉽다.
- focus 클릭 hit area가 단순하다.
- 열차 회전, glow, 입자, 카메라 이동 구현이 편하다.
- Raid 2에서 이미 같은 런타임을 사용한다.
- MVP는 외부 스프라이트 없이 `Graphics`만으로 제작할 수 있다.

## 15. 결정론 규칙

브라우저마다 같은 장면을 만들기 위해 다음은 모두 stable seed를 사용한다.

- workspace → route template
- agent → 초기 위치
- agent → 미세 속도 차이
- service night → 역 이름과 배경 사건
- 승객 생성 위치
- 환승 입자 색과 방향

렌더 프레임의 `Math.random()`은 사용하지 않는다.

시간의 기준:

- 게임 상태: 서버의 `timelineTime`
- 짧은 렌더 보간: `performance.now()`
- 실제 상태와 점수: 이벤트 시각에서만 갱신
- 카메라 흔들림, 조명, 문 애니메이션: 로컬 렌더 시간 허용

## 16. MVP 범위

### 포함

- `?game=metro`
- 고정 도시 그래프
- 최대 12개 노선 템플릿
- working 열차 이동
- idle 차량기지
- done 종착역
- blocked 선로/정비 칸
- focus 클릭과 추적 링
- 입장/퇴장 애니메이션
- 연결 끊김 동결
- `NETWORK CONTROL` 패널
- service night와 dawn 사이클
- headless 가능한 fold/view 테스트

### 제외

- 실제 철도 충돌 및 신호 시뮬레이션
- 경로 탐색
- 노선 편집기
- 음향
- 날씨
- 복잡한 열차 스프라이트
- 실제 passenger score
- 저장되는 기록과 업적
- 모바일 전용 UI

## 17. 구현 순서

### 1단계: 규칙과 상태

- `fold.ts`, `rules.ts`, `view.ts`
- working일 때만 거리 증가
- 상태 전환 시 위치 보존
- quiet/service/dawn phase
- 연결 끊김 시 동결
- 결정론 테스트

### 2단계: 최소 장면

- 도시 그래프와 노선 렌더링
- 열차를 색상 사각형으로 표시
- route progress에 따른 위치와 회전
- resize와 DPR 처리
- train 클릭 focus

### 3단계: 관제 패널

- workspace별 노선 카드
- agent 상태 행
- focus 및 blocked 우선 표시
- 키보드 focus 보존
- 접근성 label

### 4단계: 상태 연출

- 차량기지 입출고
- done 종착
- blocked 신호
- 퇴장 터널
- session restart

### 5단계: 재미 레이어

- 승객 입자
- 중앙역 환승
- service night/dawn
- 배경 사건
- 카메라 연출

## 18. 수용 기준

Metro MVP는 다음 조건을 모두 만족하면 완료로 본다.

- `?game=metro`로 직접 진입할 수 있다.
- workspace마다 안정적인 노선 색과 경로가 표시된다.
- `working` 열차만 공식 거리가 증가한다.
- `idle`, `done`, `blocked` 열차는 공식 거리가 증가하지 않는다.
- working 중 blocked가 되면 정확히 현재 선로 위치에서 멈춘다.
- idle 중 blocked가 되면 차량기지 정비 상태로 표시된다.
- agent 입장과 퇴장이 순간 생성/삭제가 아닌 이동 연출로 표현된다.
- 열차와 패널 행을 클릭하면 정확한 terminal로 focus된다.
- focused 열차가 상태 색상과 별개로 명확히 구분된다.
- 연결이 끊기면 마지막 상태가 동결된다.
- 재접속 후 같은 service night를 이어 간다.
- 두 브라우저 탭에서 노선, 위치, phase가 논리적으로 동일하다.
- 30개 agent에서도 번호와 blocked 상태를 식별할 수 있다.
- 게임 통계가 실제 생산성 지표가 아니라는 문구가 표시된다.
- `npm test`, `npm run typecheck`, `npm run build`가 통과한다.

## 19. 최종 방향

Metro의 차별점은 F1처럼 누가 앞서는가가 아니라 도시 전체가 어떻게 움직이는가에
둔다.

핵심 화면은 다음 세 가지를 가장 명확하게 보여 줘야 한다.

1. working 열차가 노선을 흐르는 모습
2. idle/done 열차가 차량기지와 종착역에 정리되는 모습
3. blocked 열차가 관제실에서 즉시 눈에 띄는 모습

첫 구현은 외부 아트 없이 벡터 노선도와 작은 열차로 시작한다. 이 형태만으로 재미가
검증되면 이후 픽셀 도시 배경, 승객, 날씨, 음향을 추가한다.
