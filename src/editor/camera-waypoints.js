// @ts-nocheck

export const CAMERA_WAYPOINT_KINDS = Object.freeze(['target', 'direction', 'quaternion']);

export const EDITOR_VIEW_STYLE = Object.freeze({
  colors: Object.freeze({
    background: '#02050b',
    grid: 'rgba(91, 231, 196, 0.14)',
    path: '#f2f6ff',
    selectedPath: '#5be7c4',
    selected: '#ffb454',
    location: '#f2f6ff',
    locationHelper: '#5be7c4',
    currentObserver: '#ffffff',
    cameraDirection: '#5ddcff',
    cameraQuaternion: '#72d7ff',
    cameraTarget: '#ffb454',
    markerStroke: '#02050b',
    label: 'rgba(226, 242, 255, 0.72)',
  }),
  plane: Object.freeze({
    currentCameraArrowLength: 46,
    targetRadius: 6,
    targetActiveRadius: 8,
    directionSize: 8,
    directionActiveSize: 10,
    quaternionSize: 10,
    markerHitRadius: 12,
  }),
});

const ZERO_VECTOR = Object.freeze({ x: 0, y: 0, z: 0 });
const DEFAULT_FORWARD = Object.freeze({ x: 0, y: 0, z: -1 });
const DEFAULT_UP = Object.freeze({ x: 0, y: 1, z: 0 });
const IDENTITY_QUATERNION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

export function cameraWaypointStyle(kind, selected = false) {
  const normalized = normalizeCameraWaypointKind(kind);
  if (selected) return { color: EDITOR_VIEW_STYLE.colors.selected, active: true, kind: normalized };
  if (normalized === 'target') return { color: EDITOR_VIEW_STYLE.colors.cameraTarget, active: false, kind: normalized };
  if (normalized === 'quaternion') return { color: EDITOR_VIEW_STYLE.colors.cameraQuaternion, active: false, kind: normalized };
  return { color: EDITOR_VIEW_STYLE.colors.cameraDirection, active: false, kind: normalized };
}

export function createCameraWaypointForFrame(id, timeSecs, frame, kind = 'direction') {
  return cameraWaypointWithKind({
    id,
    timeSecs,
  }, kind, frame);
}

export function cameraWaypointWithKind(waypoint, kind, frame = {}) {
  const nextKind = normalizeCameraWaypointKind(kind);
  const base = {
    id: String(waypoint?.id ?? ''),
    timeSecs: finiteNumber(waypoint?.timeSecs, finiteNumber(frame.sceneTimeSecs, 0)),
  };
  if (nextKind === 'target') {
    const targetGuide = cleanTargetGuide(waypoint?.targetGuide);
    return {
      ...base,
      kind: 'target',
      targetPc: cloneVector(waypoint?.targetPc ?? frame.targetPc ?? ZERO_VECTOR),
      up: cloneVector(waypoint?.up ?? frame.cameraUpPc ?? DEFAULT_UP),
      ...(targetGuide ? { targetGuide } : {}),
    };
  }
  if (nextKind === 'quaternion') {
    return {
      ...base,
      kind: 'quaternion',
      orientation: cloneQuaternion(waypoint?.orientation ?? frame.orientationIcrs ?? frame.cameraQuaternion ?? IDENTITY_QUATERNION),
    };
  }
  return {
    ...base,
    kind: 'direction',
    forward: cloneVector(waypoint?.forward ?? frame.cameraForwardPc ?? DEFAULT_FORWARD),
    up: cloneVector(waypoint?.up ?? frame.cameraUpPc ?? DEFAULT_UP),
  };
}

export function patchCameraWaypoint(waypoint, patch = {}, frame = {}) {
  const source = patch && typeof patch === 'object' ? patch : {};
  let next = source.kind != null
    ? cameraWaypointWithKind(waypoint, source.kind, frame)
    : { ...waypoint };
  if (next.kind === 'target') {
    if ('targetPc' in source) next = { ...next, targetPc: cloneVector(source.targetPc) };
    if ('up' in source) next = { ...next, up: cloneVector(source.up) };
    if ('targetGuide' in source) {
      const targetGuide = cleanTargetGuide(source.targetGuide);
      if (targetGuide) next = { ...next, targetGuide };
      else delete next.targetGuide;
    } else if ('targetPc' in source) {
      delete next.targetGuide;
    }
  } else if (next.kind === 'direction') {
    if ('forward' in source) next = { ...next, forward: cloneVector(source.forward) };
    if ('up' in source) next = { ...next, up: cloneVector(source.up) };
  } else if (next.kind === 'quaternion' && 'orientation' in source) {
    next = { ...next, orientation: cloneQuaternion(source.orientation) };
  }
  for (const [key, value] of Object.entries(source)) {
    if (key === 'kind') continue;
    if (!['targetPc', 'targetGuide', 'forward', 'up', 'orientation'].includes(key)) {
      next = { ...next, [key]: value };
    }
  }
  return next;
}

export function createCameraWaypointMarkers(journey, evaluator) {
  return (journey?.cameraLookWaypoints ?? []).map((waypoint) => {
    const pointPc = cameraWaypointMarkerPoint(waypoint, evaluator);
    return {
      type: 'camera',
      id: waypoint.id,
      kind: normalizeCameraWaypointKind(waypoint.kind),
      timeSecs: Number(waypoint.timeSecs ?? 0),
      pointPc,
      waypoint,
    };
  });
}

export function cameraWaypointMarkerPoint(waypoint, evaluator) {
  if (waypoint?.kind === 'target') return cloneVector(waypoint.targetPc ?? ZERO_VECTOR);
  return cloneVector(evaluator?.evaluate?.(Number(waypoint?.timeSecs ?? 0))?.observerPc ?? ZERO_VECTOR);
}

export function normalizeCameraWaypointKind(kind) {
  return CAMERA_WAYPOINT_KINDS.includes(kind) ? kind : 'direction';
}

function cloneVector(point) {
  return {
    x: finiteNumber(point?.x, 0),
    y: finiteNumber(point?.y, 0),
    z: finiteNumber(point?.z, 0),
  };
}

function cloneQuaternion(quaternion) {
  return {
    x: finiteNumber(quaternion?.x, 0),
    y: finiteNumber(quaternion?.y, 0),
    z: finiteNumber(quaternion?.z, 0),
    w: finiteNumber(quaternion?.w, 1),
  };
}

function cleanTargetGuide(targetGuide) {
  if (!targetGuide || typeof targetGuide !== 'object') return null;
  const id = targetGuide.id == null ? '' : String(targetGuide.id);
  const label = targetGuide.label == null ? '' : String(targetGuide.label);
  if (!id && !label) return null;
  return { id, label };
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
