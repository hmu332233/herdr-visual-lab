import { contrastText, teamColor } from '../../palette.js';
import type { MetroLineView, MetroTrainView, MetroView } from './view.js';
import {
  METRO_CITY_HEIGHT,
  METRO_CITY_WIDTH,
  METRO_DEPOTS,
  METRO_ROUTE_TEMPLATES,
  METRO_STATION_BY_ID,
  METRO_STATIONS,
  lineStyleForStableOrder,
  sampleRoute,
  type MetroDepot,
  type MetroPoint,
  type MetroRouteTemplate,
} from './routes.js';

const W = METRO_CITY_WIDTH;
const H = METRO_CITY_HEIGHT;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, 'Courier New', monospace";
const ALERT = '#ff4d5e';
const PAPER = '#f4f0df';

interface TrainRuntime {
  x: number;
  y: number;
  angle: number;
  appearedAt: number;
  departureAt: number | null;
  pendingEntry: boolean;
  transition: {
    from: MetroPoint;
    to: MetroPoint;
    fromAngle: number;
    toAngle: number;
    startedAt: number;
    duration: number;
  } | null;
}

interface HitTarget extends MetroPoint {
  id: string;
}

interface RenderTrain {
  train: MetroTrainView;
  line: MetroLineView;
  route: MetroRouteTemplate;
  runtime: TrainRuntime;
  x: number;
  y: number;
  angle: number;
  progress: number | null;
  hidden: boolean;
}

export function createMetroScene(
  canvas: HTMLCanvasElement,
  onFocus: (terminalID: string) => void,
) {
  const ctx = canvas.getContext('2d')!;
  let view: MetroView | null = null;
  let receivedAt = 0;
  let visualNow = 0;
  let hasVisualClock = false;
  let lastLiveFrameAt: number | null = null;
  let hasDrawnFrame = false;
  let needsRedraw = true;
  let dpr = 1;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let verticalStretch = 1;
  let sceneHeight = H;
  let hits: HitTarget[] = [];
  const runtimes = new Map<string, TrainRuntime>();

  resize();
  canvas.addEventListener('click', event => {
    const bounds = canvas.getBoundingClientRect();
    const point = {
      x: (event.clientX - bounds.left - ox) / scale,
      y: (event.clientY - bounds.top - oy) / scale,
    };
    const target = hits
      .map(hit => ({ hit, distance: Math.hypot(hit.x - point.x, hit.y - point.y) }))
      .filter(candidate => candidate.distance <= 19)
      .sort((a, b) => a.distance - b.distance)[0];
    if (target) onFocus(target.hit.id);
  });

  function commit(next: MetroView, receivedAtMs: number): void {
    activateScene();
    if (!hasVisualClock) {
      visualNow = receivedAtMs;
      hasVisualClock = true;
    }
    const previousTrains = new Map(
      view?.lines.flatMap(line => line.trains).map(train => [train.id, train]) ?? [],
    );
    const currentIDs = new Set<string>();

    for (const line of next.lines) {
      const route = routeForLine(line);
      for (const train of line.trains) {
        currentIDs.add(train.id);
        const target = basePosition(train, route, 0);
        let runtime = runtimes.get(train.id);
        if (!runtime) {
          const shouldAnimateEntry = train.officialDistance < .02;
          const origin = shouldAnimateEntry
            ? entrancePosition(train, route, target)
            : target;
          runtime = {
            x: origin.x,
            y: origin.y,
            angle: origin.angle,
            appearedAt: visualNow,
            departureAt: null,
            pendingEntry:
              shouldAnimateEntry &&
              next.connection.kind !== 'live' &&
              (view !== null || next.connection.kind === 'waiting'),
            transition: next.connection.kind === 'live' && shouldAnimateEntry
              ? transition(
                  origin,
                  target,
                  visualNow,
                  train.placement.kind === 'route' ? 1100 : 750,
                )
              : null,
          };
          runtimes.set(train.id, runtime);
        }

        const previous = previousTrains.get(train.id);
        if (
          runtime.pendingEntry &&
          next.connection.kind === 'live' &&
          !train.isDeparted
        ) {
          const origin = entrancePosition(train, route, target);
          runtime.x = origin.x;
          runtime.y = origin.y;
          runtime.angle = origin.angle;
          runtime.pendingEntry = false;
          runtime.transition = transition(
            origin,
            target,
            visualNow,
            train.placement.kind === 'route' ? 1100 : 750,
          );
        } else if (previous?.isDeparted && !train.isDeparted) {
          const origin = entrancePosition(train, route, target);
          runtime.x = origin.x;
          runtime.y = origin.y;
          runtime.angle = origin.angle;
          runtime.departureAt = null;
          runtime.pendingEntry = false;
          runtime.transition = transition(
            origin,
            target,
            visualNow,
            train.placement.kind === 'route' ? 1100 : 750,
          );
        } else if (previous && !previous.isDeparted && train.isDeparted) {
          const exit = nearestExit(runtime);
          runtime.departureAt = visualNow;
          runtime.pendingEntry = false;
          runtime.transition = transition(runtime, exit, visualNow, 1400);
        } else if (
          previous &&
          previous.status !== 'blocked' &&
          train.status === 'blocked'
        ) {
          runtime.x = target.x;
          runtime.y = target.y;
          runtime.angle = target.angle;
          runtime.transition = null;
        } else if (
          previous &&
          (
            previous.placement.kind !== train.placement.kind ||
            previous.lineID !== train.lineID
          )
        ) {
          runtime.transition = transition(
            runtime,
            target,
            visualNow,
            isStationaryPlacement(train) ? 1400 : 1100,
          );
        }
      }
    }

    for (const id of runtimes.keys()) {
      if (!currentIDs.has(id)) runtimes.delete(id);
    }
    view = next;
    receivedAt = receivedAtMs;
  }

  function resize(): void {
    activateScene();
    const parent = canvas.parentElement!;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const widthScale = width / W;
    verticalStretch = clamp(height / Math.max(1, H * widthScale), 1, 1.65);
    sceneHeight = H * verticalStretch;
    renderStretch = verticalStretch;
    renderHeight = sceneHeight;
    scale = Math.min(width / W, height / sceneHeight);
    ox = (width - W * scale) / 2;
    oy = (height - sceneHeight * scale) / 2;
    needsRedraw = true;
  }

  function frame(nowMs: number): void {
    const current = view;
    if (!current) return;
    activateScene();
    if (current.connection.kind !== 'live') {
      lastLiveFrameAt = null;
      if (hasDrawnFrame && !needsRedraw) return;
    } else {
      if (lastLiveFrameAt !== null) {
        visualNow += Math.max(0, nowMs - lastLiveFrameAt);
      }
      lastLiveFrameAt = nowMs;
    }
    const animationNow = visualNow;
    const extrapolation = current.connection.kind === 'live'
      ? Math.max(0, Math.min(1.5, (nowMs - receivedAt) / 1000))
      : 0;

    clearCanvas();
    ctx.setTransform(
      dpr * scale, 0, 0, dpr * scale,
      dpr * ox, dpr * oy,
    );
    drawCity(current, animationNow);
    drawRoutes(current);

    const renderTrains = collectRenderTrains(current, extrapolation, animationNow);
    applyLaneSeparation(renderTrains);
    drawPassengers(current, animationNow);
    drawStations(current, animationNow);
    drawBoardingMoments(renderTrains, animationNow);
    drawDepots(current, animationNow);
    drawFocusConnector(renderTrains);
    hits = [];
    for (const item of renderTrains) {
      if (item.hidden) continue;
      drawTrain(item, animationNow);
      hits.push({ id: item.train.id, x: item.x, y: item.y });
    }
    drawInterchangeMoment(renderTrains, animationNow);
    drawSceneLabels(current);
    if (current.phase === 'dawn') drawDawnCard(current);
    hasDrawnFrame = true;
    needsRedraw = false;
  }

  function activateScene(): void {
    sceneContext = ctx;
    renderStretch = verticalStretch;
    renderHeight = sceneHeight;
  }

  function clearCanvas(): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#071521';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function collectRenderTrains(
    current: MetroView,
    extrapolation: number,
    animationNow: number,
  ): RenderTrain[] {
    const items: RenderTrain[] = [];
    for (const line of current.lines) {
      const route = routeForLine(line);
      for (const train of line.trains) {
        const runtime = runtimes.get(train.id);
        if (!runtime) continue;
        const base = basePosition(train, route, extrapolation);
        let point = base;
        let hidden = false;
        const move = runtime.transition;
        if (runtime.pendingEntry) {
          hidden = true;
        } else if (move) {
          if (train.placement.kind === 'route' && !train.isDeparted) {
            move.to = { x: base.x, y: base.y };
            move.toAngle = base.angle;
          }
          const amount = clamp((animationNow - move.startedAt) / move.duration);
          const eased = easeInOut(amount);
          point = {
            x: lerp(move.from.x, move.to.x, eased),
            y: lerp(move.from.y, move.to.y, eased),
            angle: lerpAngle(move.fromAngle, move.toAngle, eased),
            progress: base.progress,
          };
          if (amount >= 1) {
            runtime.transition = null;
            hidden = train.isDeparted;
          }
        } else if (train.isDeparted) {
          hidden = true;
        }
        runtime.x = point.x;
        runtime.y = point.y;
        runtime.angle = point.angle;
        items.push({
          train,
          line,
          route,
          runtime,
          x: point.x,
          y: point.y,
          angle: point.angle,
          progress: point.progress,
          hidden,
        });
      }
    }
    return items;
  }

  return { commit, frame, resize };
}

function routeForLine(line: MetroLineView): MetroRouteTemplate {
  return METRO_ROUTE_TEMPLATES[line.routeTemplate] ?? METRO_ROUTE_TEMPLATES[0];
}

function basePosition(
  train: MetroTrainView,
  route: MetroRouteTemplate,
  extrapolation: number,
): MetroPoint & { angle: number; progress: number | null } {
  switch (train.placement.kind) {
    case 'route': {
      const progress = train.placement.progress + train.displaySpeed * extrapolation;
      return { ...mapSample(sampleRoute(route, progress)), progress };
    }
    case 'blocked-route':
    case 'departing':
      return {
        ...mapSample(sampleRoute(route, train.placement.progress)),
        progress: train.placement.progress,
      };
    case 'terminus': {
      const index = positiveModulo(train.placement.station, route.points.length);
      const point = route.points[index];
      const next = route.points[(index + 1) % route.points.length];
      return {
        x: point.x,
        y: renderY(point.y),
        angle: Math.atan2(
          (next.y - point.y) * renderStretch,
          next.x - point.x,
        ),
        progress: null,
      };
    }
    case 'depot':
    case 'maintenance':
      return { ...depotPosition(route, train.placement.slot), progress: null };
  }
}

function depotPosition(
  route: MetroRouteTemplate,
  slot: number,
): MetroPoint & { angle: number } {
  const depot = METRO_DEPOTS.find(candidate => candidate.id === route.depotID)
    ?? METRO_DEPOTS[0];
  const normalized = positiveModulo(slot, 8);
  const row = Math.floor(normalized / 4);
  const lane = normalized % 4 - 1.5;
  const inward = 17 + row * 14;
  const x = depot.x + Math.cos(depot.angle) * inward -
    Math.sin(depot.angle) * lane * 13;
  const y = depot.y + Math.sin(depot.angle) * inward +
    Math.cos(depot.angle) * lane * 13;
  return { x, y: renderY(y), angle: displayAngle(depot.angle) };
}

function depotGatePosition(
  route: MetroRouteTemplate,
): MetroPoint & { angle: number } {
  const depot = METRO_DEPOTS.find(candidate => candidate.id === route.depotID)
    ?? METRO_DEPOTS[0];
  const outside = 52;
  return {
    x: depot.x - Math.cos(depot.angle) * outside,
    y: renderY(depot.y - Math.sin(depot.angle) * outside),
    angle: displayAngle(depot.angle),
  };
}

function entrancePosition(
  train: MetroTrainView,
  route: MetroRouteTemplate,
  target: MetroPoint & { angle: number },
): MetroPoint & { angle: number } {
  if (train.placement.kind === 'route' ||
      train.placement.kind === 'depot' ||
      train.placement.kind === 'maintenance') {
    return depotGatePosition(route);
  }
  const tunnel = nearestMapEdge(target);
  return {
    x: tunnel.x,
    y: tunnel.y,
    angle: Math.atan2(target.y - tunnel.y, target.x - tunnel.x),
  };
}

function nearestExit(runtime: TrainRuntime): MetroPoint & { angle: number } {
  const exit = nearestMapEdge(runtime);
  return {
    x: exit.x,
    y: exit.y,
    angle: Math.atan2(exit.y - runtime.y, exit.x - runtime.x),
  };
}

function nearestMapEdge(point: MetroPoint): MetroPoint {
  const choices = [
    { x: -32, y: point.y, distance: point.x },
    { x: W + 32, y: point.y, distance: W - point.x },
    { x: point.x, y: -32, distance: point.y },
    { x: point.x, y: renderHeight + 32, distance: renderHeight - point.y },
  ];
  const edge = choices.sort((a, b) => a.distance - b.distance)[0];
  return { x: edge.x, y: edge.y };
}

function transition(
  from: MetroPoint & { angle: number },
  to: MetroPoint & { angle: number },
  startedAt: number,
  duration: number,
): TrainRuntime['transition'] {
  return {
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    fromAngle: from.angle,
    toAngle: to.angle,
    startedAt,
    duration,
  };
}

function isStationaryPlacement(train: MetroTrainView): boolean {
  return train.placement.kind === 'depot' ||
    train.placement.kind === 'maintenance' ||
    train.placement.kind === 'terminus';
}

function drawCity(view: MetroView, nowMs: number): void {
  sceneContext.save();
  sceneContext.scale(1, renderStretch);
  const dawn = view.phase === 'dawn' ? clamp(view.dawnElapsed / 8) : 0;
  const sky = ctxGradient(
    mixHex('#071521', '#6d5874', dawn * .72),
    mixHex('#0b1c2a', '#d4a98f', dawn * .62),
  );
  sceneContext.fillStyle = sky;
  sceneContext.fillRect(0, 0, W, H);

  sceneContext.fillStyle = mixHex('#0b2230', '#6d7d75', dawn * .28);
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 9; column += 1) {
      const x = 38 + column * 111 + (row % 2) * 19;
      const y = 35 + row * 106;
      const width = 48 + ((row * 11 + column * 7) % 31);
      const height = 24 + ((row * 17 + column * 13) % 34);
      sceneContext.globalAlpha = .13 + ((row + column) % 3) * .025;
      sceneContext.fillRect(x, y, width, height);
      sceneContext.fillStyle = mixHex('#7e9d99', '#ffe0aa', dawn * .5);
      sceneContext.globalAlpha = .08 + ((row * 3 + column) % 4) * .025;
      for (let windowIndex = 0; windowIndex < 3; windowIndex += 1) {
        sceneContext.fillRect(x + 8 + windowIndex * 13, y + 8, 4, 3);
      }
      sceneContext.fillStyle = mixHex('#0b2230', '#6d7d75', dawn * .28);
    }
  }
  sceneContext.globalAlpha = 1;

  sceneContext.fillStyle = mixHex('#09283a', '#668c98', dawn * .34);
  sceneContext.beginPath();
  sceneContext.moveTo(720, 0);
  sceneContext.bezierCurveTo(690, 125, 770, 245, 730, 360);
  sceneContext.bezierCurveTo(705, 430, 750, 500, 735, H);
  sceneContext.lineTo(835, H);
  sceneContext.bezierCurveTo(845, 430, 810, 330, 845, 230);
  sceneContext.bezierCurveTo(875, 135, 820, 65, 835, 0);
  sceneContext.closePath();
  sceneContext.fill();

  sceneContext.fillStyle = mixHex('#102c2b', '#6f9273', dawn * .35);
  sceneContext.globalAlpha = .72;
  sceneContext.roundRect(115, 318, 148, 104, 18);
  sceneContext.fill();
  sceneContext.globalAlpha = 1;

  sceneContext.strokeStyle = 'rgba(178,205,211,.055)';
  sceneContext.lineWidth = 1;
  for (let x = 20; x < W; x += 80) {
    sceneContext.beginPath();
    sceneContext.moveTo(x, 0);
    sceneContext.lineTo(x, H);
    sceneContext.stroke();
  }
  for (let y = 20; y < H; y += 64) {
    sceneContext.beginPath();
    sceneContext.moveTo(0, y);
    sceneContext.lineTo(W, y);
    sceneContext.stroke();
  }

  drawNightBus(view, nowMs);
  drawRiverBoat(view, nowMs);
  if (view.isLastTrain) {
    sceneContext.fillStyle = 'rgba(103,55,119,.16)';
    sceneContext.fillRect(0, 0, W, H);
    const meteor = ((view.serviceNight * 137 + view.activeServiceTime * 31) % 1200) - 120;
    sceneContext.strokeStyle = 'rgba(247,225,255,.52)';
    sceneContext.lineWidth = 1.5;
    sceneContext.beginPath();
    sceneContext.moveTo(meteor, 45);
    sceneContext.lineTo(meteor - 35, 68);
    sceneContext.stroke();
  }
  sceneContext.restore();
}

function drawNightBus(view: MetroView, nowMs: number): void {
  const moving = nowMs / 1000;
  const x = positiveModulo(moving * 18 + view.serviceNight * 91, W + 80) - 40;
  sceneContext.save();
  sceneContext.translate(x, 334);
  sceneContext.fillStyle = '#d7b763';
  sceneContext.roundRect(-12, -4, 24, 8, 3);
  sceneContext.fill();
  sceneContext.fillStyle = '#102433';
  sceneContext.fillRect(-7, -2, 5, 3);
  sceneContext.fillRect(1, -2, 5, 3);
  sceneContext.restore();
}

function drawRiverBoat(view: MetroView, nowMs: number): void {
  const moving = nowMs / 1000;
  const y = positiveModulo(moving * 8 + view.serviceNight * 47, H + 50) - 25;
  sceneContext.fillStyle = 'rgba(230,235,215,.48)';
  sceneContext.beginPath();
  sceneContext.moveTo(789, y - 7);
  sceneContext.lineTo(797, y + 6);
  sceneContext.lineTo(781, y + 6);
  sceneContext.closePath();
  sceneContext.fill();
}

function drawRoutes(view: MetroView): void {
  const focusedLine = view.lines.find(line =>
    line.trains.some(train => train.id === view.focusedTrainID))?.id ?? null;
  for (const line of view.lines) {
    const route = routeForLine(line);
    const color = teamColor(line.colorToken);
    const style = lineStyleForStableOrder(line.stableOrder);
    const active = line.workingCount > 0 || line.hasBlocked;
    const focused = line.id === focusedLine;
    const dimmed = focusedLine !== null && !focused;

    sceneContext.save();
    sceneContext.globalAlpha = dimmed ? .13 : focused ? 1 : active ? .78 : .25;
    sceneContext.lineCap = 'round';
    sceneContext.lineJoin = 'round';
    if (focused) {
      sceneContext.strokeStyle = 'rgba(244,240,223,.32)';
      sceneContext.lineWidth = 13;
      traceRoute(route);
      sceneContext.stroke();
    }
    sceneContext.strokeStyle = '#07131d';
    sceneContext.lineWidth = style.pattern === 'double' ? 11 : 9;
    sceneContext.setLineDash([]);
    traceRoute(route);
    sceneContext.stroke();

    sceneContext.strokeStyle = color;
    sceneContext.lineWidth = style.pattern === 'double' ? 7 : style.width;
    sceneContext.setLineDash([...style.dash]);
    traceRoute(route);
    sceneContext.stroke();
    if (style.pattern === 'double') {
      sceneContext.strokeStyle = '#07131d';
      sceneContext.lineWidth = 2;
      traceRoute(route);
      sceneContext.stroke();
    }
    drawTerminusMarkers(route, color);
    drawDepotSpur(route, color);
    sceneContext.restore();
  }
}

function traceRoute(route: MetroRouteTemplate): void {
  const [first, ...rest] = route.points;
  sceneContext.beginPath();
  sceneContext.moveTo(first.x, renderY(first.y));
  for (const point of rest) sceneContext.lineTo(point.x, renderY(point.y));
}

function drawTerminusMarkers(route: MetroRouteTemplate, color: string): void {
  const termini = [
    [route.points[0], route.points[1]],
    [route.points.at(-1)!, route.points.at(-2)!],
  ] as const;
  for (const [point, neighbor] of termini) {
    const angle = Math.atan2(
      (point.y - neighbor.y) * renderStretch,
      point.x - neighbor.x,
    );
    sceneContext.save();
    sceneContext.translate(point.x, renderY(point.y));
    sceneContext.rotate(angle);
    sceneContext.lineCap = 'round';
    sceneContext.strokeStyle = '#07131d';
    sceneContext.lineWidth = 8;
    sceneContext.beginPath();
    sceneContext.moveTo(0, -8);
    sceneContext.lineTo(0, 8);
    sceneContext.stroke();
    sceneContext.strokeStyle = color;
    sceneContext.lineWidth = 3.5;
    sceneContext.stroke();
    sceneContext.restore();
  }
}

function drawDepotSpur(route: MetroRouteTemplate, color: string): void {
  const depot = METRO_DEPOTS.find(candidate => candidate.id === route.depotID);
  if (!depot) return;
  const entry = METRO_STATION_BY_ID.get(depot.entryStationID);
  if (!entry) return;

  sceneContext.save();
  sceneContext.lineCap = 'round';
  sceneContext.setLineDash([4, 5]);
  sceneContext.strokeStyle = '#07131d';
  sceneContext.lineWidth = 7;
  sceneContext.beginPath();
  sceneContext.moveTo(depot.x, renderY(depot.y));
  sceneContext.lineTo(entry.x, renderY(entry.y));
  sceneContext.stroke();
  sceneContext.strokeStyle = color;
  sceneContext.lineWidth = 2.5;
  sceneContext.stroke();
  sceneContext.restore();
}

function drawPassengers(view: MetroView, nowMs: number): void {
  const working = view.lines.reduce((sum, line) => sum + line.workingCount, 0);
  if (working === 0) return;
  const rushIndex = positiveModulo(
    Math.floor(view.activeServiceTime / 22) + view.serviceNight * 3,
    METRO_STATIONS.length,
  );
  for (let stationIndex = 0; stationIndex < METRO_STATIONS.length; stationIndex += 1) {
    const station = METRO_STATIONS[stationIndex];
    const stationY = renderY(station.y);
    const count = 1 + positiveModulo(stationIndex * 7 + view.serviceNight, 3) +
      (stationIndex === rushIndex ? 5 : 0);
    for (let particle = 0; particle < count; particle += 1) {
      const seed = stationIndex * 97 + particle * 37 + view.serviceNight * 13;
      const angle = seed * 2.399 + nowMs / (4300 + (seed % 5) * 370);
      const radius = 12 + (seed % 4) * 3;
      sceneContext.fillStyle = particle % 3 === 0
        ? 'rgba(244,240,223,.72)'
        : 'rgba(174,205,211,.46)';
      sceneContext.fillRect(
        Math.round(station.x + Math.cos(angle) * radius) - 1,
        Math.round(stationY + Math.sin(angle) * radius) - 1,
        2,
        2,
      );
    }
  }
}

function drawStations(view: MetroView, nowMs: number): void {
  const rushIndex = positiveModulo(
    Math.floor(view.activeServiceTime / 22) + view.serviceNight * 3,
    METRO_STATIONS.length,
  );
  METRO_STATIONS.forEach((station, index) => {
    const stationY = renderY(station.y);
    const radius = station.interchange === 'central'
      ? 10
      : station.kind === 'interchange'
        ? 7
        : 5;
    if (index === rushIndex && view.phase !== 'dawn') {
      const pulse = 17 + Math.sin(nowMs / 280) * 3;
      sceneContext.strokeStyle = 'rgba(215,183,99,.48)';
      sceneContext.lineWidth = 2;
      sceneContext.beginPath();
      sceneContext.arc(station.x, stationY, pulse, 0, Math.PI * 2);
      sceneContext.stroke();
    }
    stationPath(station.x, stationY, radius, station.shape);
    sceneContext.fillStyle = PAPER;
    sceneContext.fill();
    sceneContext.strokeStyle = '#07131d';
    sceneContext.lineWidth = 2.5;
    sceneContext.stroke();
    if (station.kind === 'interchange') {
      sceneContext.strokeStyle = PAPER;
      sceneContext.lineWidth = station.interchange === 'central' ? 3 : 2;
      sceneContext.beginPath();
      sceneContext.arc(station.x, stationY, radius + 5, 0, Math.PI * 2);
      sceneContext.stroke();
    }
    if (index === rushIndex && view.phase === 'live') {
      drawTrainLabel(
        station.x,
        stationY - radius - 17,
        'RUSH HOUR',
        '#d7b763',
      );
    }
  });
}

function drawBoardingMoments(
  items: readonly RenderTrain[],
  nowMs: number,
): void {
  for (const item of items) {
    if (item.hidden || item.train.status !== 'working') continue;
    let closest:
      | { x: number; y: number; distance: number }
      | null = null;
    for (const stationID of item.route.stationIDs) {
      const station = METRO_STATION_BY_ID.get(stationID);
      if (!station) continue;
      const candidate = {
        x: station.x,
        y: renderY(station.y),
        distance: Math.hypot(item.x - station.x, item.y - renderY(station.y)),
      };
      if (!closest || candidate.distance < closest.distance) closest = candidate;
    }
    if (!closest || closest.distance > 30) continue;

    const intensity = 1 - closest.distance / 30;
    const color = teamColor(item.line.colorToken);
    sceneContext.save();
    sceneContext.globalAlpha = .2 + intensity * .5;
    sceneContext.strokeStyle = color;
    sceneContext.lineWidth = 1.5;
    sceneContext.beginPath();
    sceneContext.arc(
      closest.x,
      closest.y,
      9 + Math.sin(nowMs / 150 + item.train.unitNumber) * 2,
      0,
      Math.PI * 2,
    );
    sceneContext.stroke();

    for (let particle = 0; particle < 4; particle += 1) {
      const travel = positiveFraction(
        nowMs / 780 + item.train.unitNumber * .071 + particle * .23,
      );
      const amount = easeInOut(travel);
      const perpendicular = (particle - 1.5) * 2.2 * (1 - amount);
      const dx = item.x - closest.x;
      const dy = item.y - closest.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      sceneContext.fillStyle = particle === 0 ? PAPER : color;
      sceneContext.fillRect(
        lerp(closest.x, item.x, amount) - dy / length * perpendicular - 1.5,
        lerp(closest.y, item.y, amount) + dx / length * perpendicular - 1.5,
        3,
        3,
      );
    }
    sceneContext.restore();
  }
}

function stationPath(
  x: number,
  y: number,
  radius: number,
  shape: 'circle' | 'triangle' | 'square' | 'diamond',
): void {
  sceneContext.beginPath();
  if (shape === 'circle') {
    sceneContext.arc(x, y, radius, 0, Math.PI * 2);
    return;
  }
  if (shape === 'triangle') {
    sceneContext.moveTo(x, y - radius);
    sceneContext.lineTo(x + radius, y + radius);
    sceneContext.lineTo(x - radius, y + radius);
  } else {
    const rotation = shape === 'diamond' ? Math.PI / 4 : 0;
    for (let index = 0; index < 4; index += 1) {
      const angle = rotation + Math.PI / 4 + index * Math.PI / 2;
      const px = x + Math.cos(angle) * radius * 1.2;
      const py = y + Math.sin(angle) * radius * 1.2;
      if (index === 0) sceneContext.moveTo(px, py);
      else sceneContext.lineTo(px, py);
    }
  }
  sceneContext.closePath();
}

function drawDepots(view: MetroView, nowMs: number): void {
  const lineByDepot = new Map<string, MetroLineView[]>();
  for (const line of view.lines) {
    const depotID = routeForLine(line).depotID;
    const list = lineByDepot.get(depotID) ?? [];
    list.push(line);
    lineByDepot.set(depotID, list);
  }
  for (const depot of METRO_DEPOTS) {
    const lines = lineByDepot.get(depot.id) ?? [];
    drawDepotGate(depot, lines, nowMs);
  }
}

function drawDepotGate(
  depot: MetroDepot,
  lines: readonly MetroLineView[],
  nowMs: number,
): void {
  const color = lines.length > 0 ? teamColor(lines[0].colorToken) : '#526b76';
  const active = lines.some(line => line.workingCount > 0);
  sceneContext.save();
  sceneContext.translate(depot.x, renderY(depot.y));
  sceneContext.rotate(displayAngle(depot.angle));
  sceneContext.fillStyle = '#081722';
  sceneContext.strokeStyle = color;
  sceneContext.lineWidth = 3;
  sceneContext.beginPath();
  sceneContext.roundRect(-15, -11, 30, 22, 5);
  sceneContext.fill();
  sceneContext.stroke();
  sceneContext.strokeStyle = active
    ? `rgba(244,240,223,${.35 + Math.sin(nowMs / 420) * .15})`
    : 'rgba(142,164,172,.24)';
  sceneContext.lineWidth = 2;
  for (const y of [-5, 0, 5]) {
    sceneContext.beginPath();
    sceneContext.moveTo(-8, y);
    sceneContext.lineTo(8, y);
    sceneContext.stroke();
  }
  sceneContext.restore();
}

function applyLaneSeparation(items: RenderTrain[]): void {
  const buckets = new Map<string, RenderTrain[]>();
  for (const item of items) {
    if (item.hidden || item.progress === null) continue;
    const cycle = positiveFraction(item.progress);
    const physicalProgress = cycle <= .5 ? cycle * 2 : (1 - cycle) * 2;
    const key = `${item.line.id}:${Math.floor(physicalProgress * 90)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(item);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.train.unitNumber - b.train.unitNumber);
    bucket.forEach((item, index) => {
      const lane = index - (bucket.length - 1) / 2;
      const offset = clamp(lane * 7, -14, 14);
      item.x += -Math.sin(item.angle) * offset;
      item.y += Math.cos(item.angle) * offset;
    });
  }
}

function drawFocusConnector(items: readonly RenderTrain[]): void {
  const focused = items.find(item => !item.hidden && item.train.isFocused);
  if (!focused) return;
  sceneContext.save();
  sceneContext.strokeStyle = 'rgba(244,240,223,.32)';
  sceneContext.lineWidth = 1;
  sceneContext.setLineDash([3, 5]);
  sceneContext.beginPath();
  sceneContext.moveTo(focused.x, focused.y);
  sceneContext.lineTo(W, focused.y);
  sceneContext.stroke();
  sceneContext.restore();
}

function drawTrain(item: RenderTrain, nowMs: number): void {
  const { train, line } = item;
  const color = teamColor(line.colorToken);
  const pulse = .5 + Math.sin(nowMs / 360 + train.unitNumber) * .5;
  const idleAlpha = .52 + pulse * .16;
  sceneContext.save();
  sceneContext.translate(item.x, item.y);

  if (train.status === 'blocked') {
    sceneContext.strokeStyle = `rgba(255,77,94,${.28 + pulse * .34})`;
    sceneContext.lineWidth = 2;
    sceneContext.beginPath();
    sceneContext.arc(0, 0, 13 + pulse * 5, 0, Math.PI * 2);
    sceneContext.stroke();
  }
  if (train.isFocused) {
    sceneContext.strokeStyle = 'rgba(255,255,247,.92)';
    sceneContext.lineWidth = 2.5;
    sceneContext.beginPath();
    sceneContext.roundRect(-18, -11, 36, 22, 8);
    sceneContext.stroke();
  }

  sceneContext.rotate(item.angle);
  if (train.status === 'working') {
    sceneContext.strokeStyle = color;
    sceneContext.globalAlpha = .24;
    sceneContext.lineWidth = 4;
    sceneContext.beginPath();
    sceneContext.moveTo(-22, 0);
    sceneContext.lineTo(-14, 0);
    sceneContext.stroke();
  }
  sceneContext.globalAlpha = train.status === 'idle' ? idleAlpha : 1;
  sceneContext.fillStyle = color;
  sceneContext.strokeStyle = '#06111a';
  sceneContext.lineWidth = 2;
  sceneContext.beginPath();
  sceneContext.roundRect(-13, -6, 26, 12, 4);
  sceneContext.fill();
  sceneContext.stroke();

  sceneContext.fillStyle = PAPER;
  sceneContext.beginPath();
  sceneContext.arc(9.5, 0, 2.2, 0, Math.PI * 2);
  sceneContext.fill();
  if (train.status === 'done') {
    sceneContext.fillStyle = '#f4df9b';
    sceneContext.fillRect(10, -4, 2, 8);
  }
  if (train.status === 'blocked') {
    sceneContext.strokeStyle = '#ffccd1';
    sceneContext.lineWidth = 1.4;
    sceneContext.beginPath();
    sceneContext.moveTo(17, -7);
    sceneContext.lineTo(17, 2);
    sceneContext.stroke();
    sceneContext.fillStyle = ALERT;
    sceneContext.beginPath();
    sceneContext.arc(17, -8, 3.2, 0, Math.PI * 2);
    sceneContext.fill();
  }
  sceneContext.restore();

  sceneContext.fillStyle = contrastText(color);
  sceneContext.font = `950 7px ${MONO}`;
  sceneContext.textAlign = 'center';
  sceneContext.textBaseline = 'middle';
  sceneContext.fillText(String(train.unitNumber).padStart(2, '0'), item.x - 1, item.y + .5);

  if (train.isFocused || train.status === 'blocked' || train.showsNewCrew) {
    const suffix = train.showsNewCrew
      ? ' · NEW CREW'
      : train.status === 'blocked'
        ? ' · HOLD'
        : '';
    drawTrainLabel(
      item.x,
      item.y - 17,
      `#${String(train.unitNumber).padStart(2, '0')} · ${train.tabLabel}${suffix}`,
      train.status === 'blocked' ? ALERT : color,
    );
  }
}

function drawTrainLabel(x: number, y: number, label: string, color: string): void {
  sceneContext.font = `750 9px ${MONO}`;
  const width = Math.min(190, sceneContext.measureText(label).width + 14);
  const left = clamp(x - width / 2, 4, W - width - 4);
  sceneContext.fillStyle = 'rgba(5,15,23,.9)';
  sceneContext.strokeStyle = color;
  sceneContext.lineWidth = 1;
  sceneContext.beginPath();
  sceneContext.roundRect(left, y - 12, width, 18, 4);
  sceneContext.fill();
  sceneContext.stroke();
  sceneContext.fillStyle = '#eef3e9';
  sceneContext.textAlign = 'center';
  sceneContext.textBaseline = 'middle';
  sceneContext.save();
  sceneContext.beginPath();
  sceneContext.rect(left + 5, y - 10, width - 10, 14);
  sceneContext.clip();
  sceneContext.fillText(label, left + width / 2, y - 3);
  sceneContext.restore();
}

function drawInterchangeMoment(items: readonly RenderTrain[], nowMs: number): void {
  const central = METRO_STATIONS.find(station => station.interchange === 'central');
  if (!central) return;
  const centralY = renderY(central.y);
  const nearby = items.filter(item =>
    !item.hidden &&
    item.train.status === 'working' &&
    Math.hypot(item.x - central.x, item.y - centralY) < 42);
  if (new Set(nearby.map(item => item.line.id)).size < 2) return;
  const pulse = 20 + Math.sin(nowMs / 220) * 3;
  sceneContext.strokeStyle = 'rgba(244,240,223,.55)';
  sceneContext.lineWidth = 2;
  sceneContext.beginPath();
  sceneContext.arc(central.x, centralY, pulse, 0, Math.PI * 2);
  sceneContext.stroke();
  drawTrainLabel(central.x, centralY - 22, 'INTERCHANGE', PAPER);
}

function drawSceneLabels(view: MetroView): void {
  sceneContext.fillStyle = 'rgba(4,13,20,.72)';
  sceneContext.beginPath();
  sceneContext.roundRect(18, 17, 190, 42, 7);
  sceneContext.fill();
  sceneContext.fillStyle = '#eaf1e9';
  sceneContext.font = `800 11px ${MONO}`;
  sceneContext.textAlign = 'left';
  sceneContext.textBaseline = 'alphabetic';
  sceneContext.fillText('HERDR METRO', 31, 36);
  sceneContext.fillStyle = '#78909c';
  sceneContext.font = `700 7px ${MONO}`;
  sceneContext.fillText(`NIGHT GRID · ${view.lines.length} LINES · CONTROL ${view.connection.kind.toUpperCase()}`, 31, 49);

  for (const station of METRO_STATIONS.filter(item => item.kind === 'interchange')) {
    const stationY = renderY(station.y);
    sceneContext.fillStyle = 'rgba(4,13,20,.68)';
    const width = sceneContext.measureText(station.label).width + 10;
    sceneContext.fillRect(station.x + 13, stationY - 8, width, 13);
    sceneContext.fillStyle = 'rgba(235,240,228,.76)';
    sceneContext.font = `700 7px ${MONO}`;
    sceneContext.fillText(station.label, station.x + 18, stationY + 1);
  }

  if (view.phase === 'quietHours') {
    sceneContext.font = `800 10px ${MONO}`;
    const totalTrains = view.lines.reduce(
      (total, line) => total + line.totalTrains,
      0,
    );
    const label = totalTrains === 0
      ? 'QUIET HOURS · NO TRAINS DISPATCHED'
      : 'QUIET HOURS · ALL TRAINS HOLDING';
    const width = sceneContext.measureText(label).width + 28;
    sceneContext.fillStyle = 'rgba(4,13,20,.82)';
    sceneContext.beginPath();
    sceneContext.roundRect((W - width) / 2, renderHeight - 52, width, 28, 14);
    sceneContext.fill();
    sceneContext.fillStyle = '#9ab0b7';
    sceneContext.textAlign = 'center';
    sceneContext.textBaseline = 'middle';
    sceneContext.fillText(label, W / 2, renderHeight - 38);
  }
}

function drawDawnCard(view: MetroView): void {
  const trains = view.lines.flatMap(line => line.trains).filter(train => !train.isDeparted);
  const dispatched = trains.filter(train =>
    train.officialDistance > 0 || train.status === 'working').length;
  const stationsVisited = trains.reduce((total, train) => {
    const line = view.lines.find(candidate => candidate.id === train.lineID);
    const stops = line ? routeForLine(line).stationIDs.length : 1;
    return total + Math.floor(train.officialDistance * stops);
  }, 0);
  const interchanges = Math.floor((stationsVisited + view.serviceNight * 3) / 11);

  sceneContext.fillStyle = 'rgba(19,17,32,.62)';
  sceneContext.fillRect(0, 0, W, renderHeight);
  const x = W / 2 - 230;
  const y = renderHeight / 2 - 116;
  sceneContext.fillStyle = 'rgba(7,18,29,.94)';
  sceneContext.strokeStyle = 'rgba(239,218,238,.48)';
  sceneContext.lineWidth = 1.5;
  sceneContext.beginPath();
  sceneContext.roundRect(x, y, 460, 232, 14);
  sceneContext.fill();
  sceneContext.stroke();

  sceneContext.textAlign = 'center';
  sceneContext.textBaseline = 'alphabetic';
  sceneContext.fillStyle = '#f0d9ef';
  sceneContext.font = `850 18px ${MONO}`;
  sceneContext.fillText(`SERVICE NIGHT ${String(view.serviceNight).padStart(2, '0')} COMPLETE`, W / 2, y + 39);
  sceneContext.fillStyle = '#8f7896';
  sceneContext.font = `700 7px ${MONO}`;
  sceneContext.fillText('CENTRAL CONTROL · DAWN HANDOVER', W / 2, y + 56);

  const stats = [
    [dispatched, 'TRAINS DISPATCHED'],
    [stationsVisited, 'STATIONS VISITED'],
    [interchanges, 'INTERCHANGE MOMENTS'],
  ] as const;
  stats.forEach(([value, label], index) => {
    const center = x + 76 + index * 154;
    sceneContext.fillStyle = '#eff4ec';
    sceneContext.font = `850 24px ${MONO}`;
    sceneContext.fillText(value.toLocaleString(), center, y + 113);
    sceneContext.fillStyle = '#78909c';
    sceneContext.font = `750 7px ${MONO}`;
    sceneContext.fillText(label, center, y + 130);
  });
  sceneContext.strokeStyle = 'rgba(183,214,225,.12)';
  sceneContext.beginPath();
  sceneContext.moveTo(x + 28, y + 153);
  sceneContext.lineTo(x + 432, y + 153);
  sceneContext.stroke();
  sceneContext.fillStyle = '#899ca2';
  sceneContext.font = `650 7px ${FONT}`;
  sceneContext.fillText(
    'Fictional transit activity generated for spectatorship.',
    W / 2,
    y + 178,
  );
  sceneContext.fillText('Not a productivity metric.', W / 2, y + 192);
}

let sceneContext: CanvasRenderingContext2D;
let renderStretch = 1;
let renderHeight = H;

function renderY(y: number): number {
  return y * renderStretch;
}

function displayAngle(angle: number): number {
  return Math.atan2(
    Math.sin(angle) * renderStretch,
    Math.cos(angle),
  );
}

function mapSample(
  sample: MetroPoint & { angle: number },
): MetroPoint & { angle: number } {
  return {
    x: sample.x,
    y: renderY(sample.y),
    angle: displayAngle(sample.angle),
  };
}

function ctxGradient(top: string, bottom: string): CanvasGradient {
  const gradient = sceneContext.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  return gradient;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function lerpAngle(a: number, b: number, amount: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * amount;
}

function easeInOut(value: number): number {
  return value < .5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function positiveFraction(value: number): number {
  return positiveModulo(value, 1);
}

function mixHex(from: string, to: string, amount: number): string {
  const start = parseHex(from);
  const end = parseHex(to);
  const channel = (index: number) =>
    Math.round(lerp(start[index], end[index], clamp(amount)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function parseHex(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}
