// @ts-nocheck
import { DEFAULT_EDITOR_UNITS_PER_PARSEC } from '../../index.js';
import {
  EDITOR_VIEW_STYLE,
  cameraWaypointStyle,
} from '../camera-waypoints.js';
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
    resize(size) {
      renderSnapshot(size);
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

  function renderSnapshot(size) {
    if (!canvas || !snapshot) return;
    const { width, height, context: drawing } = syncCanvas(canvas, size);
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
    const dragStartPoint = widgetPoint(snapshot.journey, marker.type, marker.id);
    if (!dragStartPoint) return;
    const move = (moveEvent) => {
      if (!canvas || !context || !snapshot) return;
      const canvasPos = canvasPoint(canvas, moveEvent.clientX, moveEvent.clientY);
      const currentPoint = widgetPoint(snapshot.journey, marker.type, marker.id) ?? dragStartPoint;
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
  context.fillStyle = EDITOR_VIEW_STYLE.colors.background;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = EDITOR_VIEW_STYLE.colors.grid;
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
  context.strokeStyle = EDITOR_VIEW_STYLE.colors.path;
  context.lineWidth = 2;
  context.beginPath();
  for (const [index, sample] of snapshot.samples.entries()) {
    const point = projectJourneyEditorPoint(sample.observerPc, projection);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.stroke();
  drawSelectedLocationRangePath(context, snapshot, projection);
  for (const guide of snapshot.journey.guides ?? []) {
    const point = projectJourneyEditorPoint(guide.positionPc, projection);
    context.strokeStyle = isSelected(snapshot, 'guide', guide.id)
      ? EDITOR_VIEW_STYLE.colors.selected
      : guide.color ?? EDITOR_VIEW_STYLE.colors.cameraQuaternion;
    context.lineWidth = isSelected(snapshot, 'guide', guide.id) ? 3 : 1.5;
    context.beginPath();
    context.arc(point.x, point.y, Math.max(4, Number(guide.radiusPc ?? 1) * unitsPerParsec), 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = guide.color ?? EDITOR_VIEW_STYLE.colors.cameraQuaternion;
    context.fillText(guide.label ?? guide.id, point.x + 7, point.y - 7);
    markers.push({ type: 'guide', id: guide.id, x: point.x, y: point.y, radius: 12 });
  }
  for (const waypoint of snapshot.journey.locationWaypoints ?? []) {
    const point = projectJourneyEditorPoint(waypoint.positionPc, projection);
    context.fillStyle = isSelected(snapshot, 'location', waypoint.id)
      ? EDITOR_VIEW_STYLE.colors.selected
      : waypoint.motionGroup?.role === 'helper'
        ? EDITOR_VIEW_STYLE.colors.locationHelper
        : EDITOR_VIEW_STYLE.colors.location;
    context.strokeStyle = waypoint.motionGroup?.role
      ? EDITOR_VIEW_STYLE.colors.locationHelper
      : EDITOR_VIEW_STYLE.colors.markerStroke;
    context.lineWidth = isSelected(snapshot, 'location', waypoint.id) || waypoint.motionGroup?.role ? 2.5 : 2;
    context.beginPath();
    context.arc(point.x, point.y, waypoint.motionGroup?.role === 'helper' ? 4 : 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    markers.push({ type: 'location', id: waypoint.id, x: point.x, y: point.y, radius: 11 });
  }
  for (const marker of snapshot.cameraMarkers ?? []) {
    const point = projectJourneyEditorPoint(marker.pointPc, projection);
    drawCameraWaypointMarker(context, snapshot, marker, point);
    markers.push({
      type: 'camera',
      id: marker.id,
      x: point.x,
      y: point.y,
      radius: EDITOR_VIEW_STYLE.plane.markerHitRadius,
    });
  }
  const current = projectJourneyEditorPoint(snapshot.evaluated.observerPc, projection);
  context.fillStyle = EDITOR_VIEW_STYLE.colors.currentObserver;
  context.beginPath();
  context.arc(current.x, current.y, 5, 0, Math.PI * 2);
  context.fill();
  drawPlaneArrow(
    context,
    current,
    projectDirectionToPlane(snapshot.evaluated.cameraForwardPc, projection),
    EDITOR_VIEW_STYLE.colors.cameraDirection,
    EDITOR_VIEW_STYLE.plane.currentCameraArrowLength,
  );
  return markers;
}

function drawSelectedLocationRangePath(context, snapshot, projection) {
  const range = snapshot.editorState.selectedLocationRange;
  if (!range) return;
  const selected = (snapshot.journey.locationWaypoints ?? [])
    .filter((waypoint) => waypoint.id === range.anchorId || waypoint.id === range.focusId)
    .sort((left, right) => Number(left.timeSecs ?? 0) - Number(right.timeSecs ?? 0));
  if (selected.length !== 2) return;
  const start = Number(selected[0].timeSecs ?? 0);
  const end = Number(selected[1].timeSecs ?? 0);
  const samples = (snapshot.samples ?? []).filter((sample) => (
    Number(sample.sceneTimeSecs ?? 0) >= start && Number(sample.sceneTimeSecs ?? 0) <= end
  ));
  if (samples.length < 2) return;
  context.strokeStyle = EDITOR_VIEW_STYLE.colors.selectedPath;
  context.lineWidth = 4;
  context.beginPath();
  for (const [index, sample] of samples.entries()) {
    const point = projectJourneyEditorPoint(sample.observerPc, projection);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.stroke();
}

function drawCameraWaypointMarker(context, snapshot, marker, point) {
  const style = cameraWaypointStyle(marker.kind, isSelected(snapshot, 'camera', marker.id));
  if (marker.kind === 'target') {
    drawCameraTargetMarker(context, point, style.color, style.active);
  } else if (marker.kind === 'quaternion') {
    drawCameraQuaternionMarker(context, point, style.color, style.active);
  } else {
    drawCameraDirectionMarker(context, point, style.color, style.active);
  }
}

function drawCameraTargetMarker(context, point, color, active) {
  const radius = active ? EDITOR_VIEW_STYLE.plane.targetActiveRadius : EDITOR_VIEW_STYLE.plane.targetRadius;
  context.strokeStyle = color;
  context.fillStyle = active ? color : 'rgba(255, 180, 84, 0.18)';
  context.lineWidth = active ? 3 : 1.5;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(point.x - 10, point.y);
  context.lineTo(point.x + 10, point.y);
  context.moveTo(point.x, point.y - 10);
  context.lineTo(point.x, point.y + 10);
  context.stroke();
  context.font = '11px ui-sans-serif, system-ui';
  context.fillStyle = active ? color : 'rgba(255, 180, 84, 0.82)';
  context.fillText('Look', point.x + 7, point.y - 8);
}

function drawCameraDirectionMarker(context, point, color, active) {
  const size = active ? EDITOR_VIEW_STYLE.plane.directionActiveSize : EDITOR_VIEW_STYLE.plane.directionSize;
  context.save();
  context.translate(point.x, point.y);
  context.rotate(Math.PI / 4);
  context.fillStyle = color;
  context.strokeStyle = EDITOR_VIEW_STYLE.colors.markerStroke;
  context.lineWidth = 2;
  context.fillRect(-size / 2, -size / 2, size, size);
  context.strokeRect(-size / 2, -size / 2, size, size);
  context.restore();
}

function drawCameraQuaternionMarker(context, point, color, active) {
  const size = active ? EDITOR_VIEW_STYLE.plane.quaternionSize + 2 : EDITOR_VIEW_STYLE.plane.quaternionSize;
  context.strokeStyle = color;
  context.fillStyle = active ? color : 'rgba(114, 215, 255, 0.14)';
  context.lineWidth = active ? 3 : 2;
  context.beginPath();
  context.moveTo(point.x, point.y - size * 0.65);
  context.lineTo(point.x + size * 0.62, point.y + size * 0.45);
  context.lineTo(point.x - size * 0.62, point.y + size * 0.45);
  context.closePath();
  context.fill();
  context.stroke();
  context.beginPath();
  context.arc(point.x, point.y, size * 0.28, 0, Math.PI * 2);
  context.stroke();
}

function drawPlaneArrow(context, from, vector, color, scale = 1) {
  const length = Math.hypot(Number(vector.x ?? 0), Number(vector.y ?? 0));
  if (length <= 0.001) return;
  const end = {
    x: from.x + Number(vector.x ?? 0) * scale,
    y: from.y + Number(vector.y ?? 0) * scale,
  };
  const angle = Math.atan2(end.y - from.y, end.x - from.x);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(end.x - Math.cos(angle - 0.55) * 9, end.y - Math.sin(angle - 0.55) * 9);
  context.lineTo(end.x - Math.cos(angle + 0.55) * 9, end.y - Math.sin(angle + 0.55) * 9);
  context.closePath();
  context.fill();
}

function projectDirectionToPlane(vector, projection) {
  const [axisA, axisB] = projection.axes;
  return {
    x: Number(vector?.[axisA] ?? 0),
    y: -Number(vector?.[axisB] ?? 0),
  };
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
