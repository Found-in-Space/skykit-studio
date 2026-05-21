// @ts-nocheck
import { DEFAULT_EDITOR_UNITS_PER_PARSEC } from '../../index.js';
import { createAxisIndicatorOverlay } from '../axis-indicator.js';
import {
  createJourneyProjectionTransform,
  hitJourneyEditorMarker,
  projectJourneyEditorPoint,
  unprojectJourneyEditorPoint,
} from '../projection.js';
import {
  canvasPoint,
  isSelected,
  syncCanvas,
  widgetPoint,
} from './shared.js';

/** @param {string} mode */
export function createProjectionView(mode) {
  let context = /** @type {import('../views.js').JourneyVideoEditorViewContext | null} */ (null);
  let canvas = /** @type {HTMLCanvasElement | null} */ (null);
  let axisIndicator = null;
  let snapshot = /** @type {import('../views.js').JourneyVideoEditorViewSnapshot | null} */ (null);
  let markers = /** @type {Array<Record<string, unknown>>} */ ([]);
  let projection = /** @type {Record<string, unknown> | null} */ (null);

  return {
    mode,
    mount(nextContext) {
      context = nextContext;
      canvas = nextContext.doc.createElement('canvas');
      canvas.className = 'jve-tile-canvas';
      nextContext.body.append(canvas);
      axisIndicator = createAxisIndicatorOverlay(nextContext.doc);
      nextContext.body.append(axisIndicator.canvas);
      canvas.addEventListener('click', onClick);
      canvas.addEventListener('pointerdown', onPointerDown);
    },
    update(nextSnapshot) {
      snapshot = nextSnapshot;
      renderSnapshot();
    },
    resize() {
      renderSnapshot();
    },
    dispose() {
      canvas?.removeEventListener('click', onClick);
      canvas?.removeEventListener('pointerdown', onPointerDown);
      axisIndicator?.dispose();
      canvas?.remove();
      canvas = null;
      axisIndicator = null;
      context = null;
      snapshot = null;
      markers = [];
      projection = null;
    },
  };

  function renderSnapshot() {
    if (!canvas || !snapshot) return;
    const { width, height, context: drawing } = syncCanvas(canvas);
    if (!drawing) return;
    projection = createJourneyProjectionTransform({
      mode,
      width,
      height,
      unitsPerParsec: Number(snapshot.editorState.unitsPerParsec ?? DEFAULT_EDITOR_UNITS_PER_PARSEC),
      centerPc: snapshot.evaluated.observerPc,
    });
    markers = drawProjection(drawing, snapshot, projection);
    axisIndicator?.renderPlane(mode);
  }

  /** @param {MouseEvent} event */
  function onClick(event) {
    if (!canvas || !context) return;
    const point = canvasPoint(canvas, event.clientX, event.clientY);
    const marker = hitJourneyEditorMarker(markers, point.x, point.y);
    if (!marker) return;
    context.dispatch({
      type: 'selectWidget',
      widgetType: marker.type,
      id: marker.id,
      extendRange: event.shiftKey,
    });
  }

  /** @param {PointerEvent} event */
  function onPointerDown(event) {
    if (!canvas || !context || !snapshot || !projection) return;
    const point = canvasPoint(canvas, event.clientX, event.clientY);
    const marker = hitJourneyEditorMarker(markers, point.x, point.y);
    if (!marker) return;
    event.preventDefault();
    context.dispatch({
      type: 'selectWidget',
      widgetType: marker.type,
      id: marker.id,
      extendRange: event.shiftKey,
    });
    const dragProjection = projection;
    const move = (moveEvent) => {
      if (!canvas || !context || !snapshot) return;
      const currentPoint = widgetPoint(snapshot.journey, marker.type, marker.id);
      if (!currentPoint) return;
      const canvasPos = canvasPoint(canvas, moveEvent.clientX, moveEvent.clientY);
      const next = unprojectJourneyEditorPoint(canvasPos, dragProjection, currentPoint);
      context.dispatch({
        type: 'updateWidgetPoint',
        widgetType: marker.type,
        id: marker.id,
        pointPc: next,
      });
    };
    const done = () => {
      globalThis.removeEventListener('pointermove', move);
      globalThis.removeEventListener('pointerup', done);
    };
    globalThis.addEventListener('pointermove', move);
    globalThis.addEventListener('pointerup', done, { once: true });
  }
}

/**
 * @param {CanvasRenderingContext2D} context
 * @param {import('../views.js').JourneyVideoEditorViewSnapshot} snapshot
 * @param {Record<string, unknown>} projection
 */
function drawProjection(context, snapshot, projection) {
  const width = Number(projection.width ?? 1);
  const height = Number(projection.height ?? 1);
  const markers = [];
  context.fillStyle = '#02050b';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(91, 231, 196, 0.14)';
  context.lineWidth = 1;
  const unitsPerParsec = Number(projection.unitsPerParsec ?? 1);
  const gridStepPc = chooseProjectionGridStepPc(unitsPerParsec);
  const minA = Number(projection.centerA ?? 0) - width / 2 / unitsPerParsec;
  const maxA = Number(projection.centerA ?? 0) + width / 2 / unitsPerParsec;
  const minB = Number(projection.centerB ?? 0) - height / 2 / unitsPerParsec;
  const maxB = Number(projection.centerB ?? 0) + height / 2 / unitsPerParsec;
  for (let value = Math.floor(minA / gridStepPc) * gridStepPc; value <= maxA; value += gridStepPc) {
    context.beginPath();
    const x = width / 2 + (value - Number(projection.centerA ?? 0)) * unitsPerParsec;
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let value = Math.floor(minB / gridStepPc) * gridStepPc; value <= maxB; value += gridStepPc) {
    context.beginPath();
    const y = height / 2 - (value - Number(projection.centerB ?? 0)) * unitsPerParsec;
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.strokeStyle = '#f2f6ff';
  context.lineWidth = 2;
  context.beginPath();
  for (const [index, sample] of snapshot.samples.entries()) {
    const point = projectJourneyEditorPoint(sample.observerPc, projection);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.stroke();
  for (const guide of snapshot.journey.guides ?? []) {
    const point = projectJourneyEditorPoint(guide.positionPc, projection);
    context.strokeStyle = guide.color ?? '#8fd5ff';
    context.lineWidth = isSelected(snapshot, 'guide', guide.id) ? 3 : 1.5;
    context.beginPath();
    context.arc(point.x, point.y, Math.max(4, Number(guide.radiusPc ?? 1) * unitsPerParsec), 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = guide.color ?? '#8fd5ff';
    context.fillText(guide.label ?? guide.id, point.x + 7, point.y - 7);
    markers.push({ type: 'guide', id: guide.id, x: point.x, y: point.y, radius: 12 });
  }
  for (const waypoint of snapshot.journey.locationWaypoints ?? []) {
    const point = projectJourneyEditorPoint(waypoint.positionPc, projection);
    context.fillStyle = isSelected(snapshot, 'location', waypoint.id) ? '#ffb454' : waypoint.motionGroup?.role === 'helper' ? '#5be7c4' : '#f2f6ff';
    context.beginPath();
    context.arc(point.x, point.y, waypoint.motionGroup?.role === 'helper' ? 4 : 6, 0, Math.PI * 2);
    context.fill();
    markers.push({ type: 'location', id: waypoint.id, x: point.x, y: point.y, radius: 11 });
  }
  for (const waypoint of snapshot.journey.cameraLookWaypoints ?? []) {
    if (waypoint.kind !== 'target') continue;
    const point = projectJourneyEditorPoint(waypoint.targetPc, projection);
    context.strokeStyle = isSelected(snapshot, 'camera', waypoint.id) ? '#ffb454' : '#5ddcff';
    context.beginPath();
    context.arc(point.x, point.y, 8, 0, Math.PI * 2);
    context.stroke();
    markers.push({ type: 'camera', id: waypoint.id, x: point.x, y: point.y, radius: 12 });
  }
  const current = projectJourneyEditorPoint(snapshot.evaluated.observerPc, projection);
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(current.x, current.y, 5, 0, Math.PI * 2);
  context.fill();
  return markers;
}

function chooseProjectionGridStepPc(unitsPerParsec) {
  const targetUnits = 80;
  const rawStep = targetUnits / Math.max(0.001, Number(unitsPerParsec) || 1);
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1e-9, rawStep)));
  for (const multiple of [1, 2, 5, 10]) {
    const step = multiple * magnitude;
    if (step * unitsPerParsec >= targetUnits) return step;
  }
  return 10 * magnitude;
}
