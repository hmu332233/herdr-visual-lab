# Herdr F1

**Herdr에서 일하는 코딩 에이전트들을 실시간 Grand Prix로 바꾸는 로컬 웹 대시보드입니다.**

명령어 하나를 실행하면 브라우저에 공용 서킷이 열립니다. 각 Herdr workspace는
레이싱 팀이 되고, 감지된 agent terminal은 고유 번호를 가진 차량이 됩니다.
에이전트가 작업을 시작하면 차량이 달리고, 쉬면 피트에 들어가며, 막히면 사고로
표시됩니다. 여러 브라우저 탭을 열어도 모두 같은 레이스를 관전합니다.

이 도구는 에이전트의 성과를 평가하는 분석 도구가 아닙니다. Herdr의 실제 세션
상태를 재미있고 한눈에 보기 쉬운 라이브 장면으로 표현하는 **로컬 관전 도구**입니다.

## 무엇을 보여 주나요?

| Herdr | 레이스 표현 |
| --- | --- |
| workspace | constructor / 팀 |
| agent terminal | 고유 번호를 가진 차량 |
| `working` | 서킷 주행 |
| `idle` | 팀 피트에서 대기 |
| `done` | 점수를 멈추고 쿨다운 |
| `blocked` | 해당 위치에서 사고로 정지 |
| focused terminal | `ONBOARD` 강조 |

마커나 순위표 행을 클릭하거나 Return/Space로 활성화하면 해당 Herdr terminal로
포커스를 이동합니다. 이 동작은 `agent.focus`만 전송하며 에이전트 상태를 임의로
변경하지 않습니다.

## 실제 데이터와 가상 데이터

Herdr `session.snapshot`에서 가져오는 실제 정보:

- workspace와 팀 구성
- workspace / tab 라벨
- agent 종류와 `idle` / `working` / `done` / `blocked` 상태
- 현재 focus

대시보드가 재미를 위해 만드는 가상 정보:

- 랩, 거리, 페이스와 순위
- 팀 점수와 포디엄
- Grand Prix 결과

가상 정보는 각 브라우저 탭이 서버의 중립 이벤트 저널을 폴드해 결정하며, 저널은
CLI 프로세스가 살아 있는 동안만 메모리에 유지됩니다. 생산성,
진행률, 메시지 수 또는 token 사용량을 나타내지 않으며 프로세스를 다시 실행하면
모두 초기화됩니다.

## 빠른 시작

요구 사항:

- Node.js 20 이상
- 실행 중인 Herdr 0.7.4 이상(protocol 16 또는 17)

저장소에서 설치하고 실행합니다.

```sh
npm install
npm run build
npm link
herdr-f1
```

CLI가 `127.0.0.1`에 웹 서버를 열고 기본 브라우저를 자동으로 실행합니다.

```text
Herdr F1 · http://127.0.0.1:4158
Press Ctrl+C to stop.
```

Herdr가 아직 실행 중이 아니어도 CLI는 종료되지 않습니다. 기본 Unix socket을
기다리며 화면에는 `FORMATION LAP · AWAITING GRID`가 표시됩니다.

## 사용법

```text
herdr-f1 [start] [options]
```

```text
--port <n>        시작 포트 지정 (기본 4158, 사용 중이면 다음 포트 탐색)
--no-open         브라우저를 자동으로 열지 않음
--socket <path>   Herdr Unix socket 경로 지정
--fixture <name>  Herdr 없이 디자인 fixture 실행
--speed <n>       게임별 기본 속도에 적용할 배율 (기본 1).
                  F1 기본 속도는 1, Raid/Raid 2 기본 속도는 5
```

`start`는 이전 호출 방식과의 호환을 위한 선택적 alias입니다.

예시:

```sh
herdr-f1 --no-open --port 4158
herdr-f1 --socket /custom/path/herdr.sock
herdr-f1 --fixture grid
```

사용 가능한 fixture는 `grid`, `dense`, `redflag`, `error`, `podium`입니다.

## 게임 포맷 선택 (`?game=`)

같은 서버 세션을 여러 게임 포맷으로 관전할 수 있습니다. 포맷은 브라우저 탭마다
URL 쿼리로 고릅니다 — 서버는 관여하지 않으므로 한 탭은 F1, 다른 탭은 레이드로
동시에 같은 세션을 볼 수 있습니다.

지원하는 게임은 다음 다섯 가지입니다.

| 게임 | URL | 표현 방식 |
| --- | --- | --- |
| F1 | `/` 또는 `?game=f1` | workspace는 constructor, agent는 서킷을 달리는 차량 |
| Raid | `?game=raid` | workspace는 guild, agent의 누적 진행은 보스에게 준 damage |
| Raid 2 | `?game=raid2` | Raid과 규칙·점수 동일, 하늘과 땅이 있는 가로 사이드뷰 2D 전장에서 전신 히어로(전사·마법사·궁수)가 우측의 거대 보스를 공격하는 비주얼 버전 |
| Tiny Spaceport | `?game=spaceport` | workspace는 cargo dock, agent는 우주선에 화물을 나르는 pixel courier |
| Metro | `?game=metro` | workspace는 노선, agent는 심야 도시를 순환하는 추상 열차 |

예를 들어 기본 포트에서는 다음 주소로 접속합니다.

```text
http://localhost:4158/              # 기본 F1
http://localhost:4158/?game=f1      # F1
http://localhost:4158/?game=raid    # Raid
http://localhost:4158/?game=raid2   # Raid 2 (side-view battlefield)
http://localhost:4158/?game=spaceport # Tiny Spaceport
http://localhost:4158/?game=metro   # Herdr Metro
```

Defense 포맷은 폐기되었습니다. 해당 이름을 포함한 알 수 없는 포맷 값은
일반 fallback 규칙에 따라 F1을 표시합니다.

Tiny Spaceport는 60초 동안 화물을 싣고 15초 동안 발사를 구경하는 협동 픽셀 게임입니다.
`working` agent는 귀여운 courier robot이 되어 dock과 중앙 우주선을 오가고, `done`은
큰 화물 적재, `idle`은 충전, `blocked`는 cargo route jam으로 표현됩니다. 발사량을
채우면 우주선이 다음 행성으로 출발하고 성공 streak가 이어집니다. 기존
`?game=foundry` URL도 호환 alias로 같은 화면을 표시합니다. 화물, 점수, 발사 결과는
실제 생산성 지표가 아닌 관전용 가상 정보입니다.

Metro는 workspace마다 안정적인 색과 경로를 가진 지하철 노선을 만들고, agent를 고유
번호가 붙은 작은 기하학 열차로 표시합니다. `working` 열차만 운행하고 `idle`은
차량기지, `done`은 종착역, `blocked`는 현재 선로 또는 정비 칸의 신호 대기로
표현됩니다. 75초의 심야 운행과 8초의 새벽 연출에서 보이는 운행 횟수와 역 방문은
관전용 가상 정보이며 실제 진척도나 생산성 지표가 아닙니다.

새 포맷은 `src/web/formats/<name>/` 디렉터리 하나로 추가합니다. 서버와 프로토콜은
게임 어휘를 전혀 알지 못합니다.

## 레이스 동작

- 한 Grand Prix는 58랩이며 선두 차량이 완주하면 팀 포디엄을 보여 준 뒤 다음
  레이스가 자동으로 시작됩니다.
- `working` 차량만 공식 거리가 증가합니다. 차량별 페이스는 가상으로 결정됩니다.
- `idle`, `done`, `blocked` 차량의 공식 거리는 증가하지 않습니다.
- 사라진 terminal은 현재 레이스 동안 `RETIRED`로 남고 다음 grid에서 제거됩니다.
- 연결이 끊기면 마지막 상태를 동결하고 `RED FLAG · HERDR OFFLINE`을 표시합니다.
  재연결되면 같은 Grand Prix를 이어 갑니다.
- 한 Grand Prix에는 최대 99대의 차량이 참가할 수 있습니다.

## 구조와 로컬 보안

Node 서버가 Herdr Unix socket에 연결하고 프로세스 수명 동안 완전한 게임 중립 이벤트
저널을 소유합니다. 20,000건을 넘어도 기록을 버리지 않으며, 각 브라우저 탭은 전체
history와 seq가 연속인 delta를 폴드해 F1/Raid/Spaceport/Metro 상태를 독립적으로 만듭니다.
`--speed`는 1초 cap이 적용된 wall time이 중립 `timelineTime`을 늘리는 비율이며 tick
레코드를 만들지 않습니다. 프로세스를 재시작하면 새 저널이 시작됩니다.

서버는 terminal focus를
제어할 수 있으므로 외부 네트워크에 노출하지 않고 `127.0.0.1`에만 바인딩합니다.
terminal 출력 polling, session log parsing 또는 레이스 기록 저장은 하지 않습니다.

런타임 의존성은 [`ws`](https://www.npmjs.com/package/ws) 하나입니다.

## 개발

```sh
npm test             # 엔진, 프로토콜, 서버, 브라우저 상태 테스트
npm run typecheck    # TypeScript 검사
npm run build        # 웹과 Node 서버 프로덕션 빌드
```

웹과 서버를 따로 실행하며 개발할 수도 있습니다.

```sh
npm run dev:server
npm run dev:web
```

테스트의 fake Herdr는 임시 Unix domain socket을 사용합니다. 제한된 sandbox에서
socket 또는 localhost 바인딩이 금지되어 있으면 `EPERM`이 발생할 수 있습니다.
