// @ts-nocheck
import { createTimedJourneyEvaluator, normalizeTimedJourney } from '../camera-timeline.js';

const DEFAULT_AXES = Object.freeze({
  xy: Object.freeze(['x', 'y']),
  xz: Object.freeze(['x', 'z']),
  yz: Object.freeze(['y', 'z']),
});

/**
 * @param {unknown} journeyInput
 * @param {{ sampleStepSecs?: number }} [options]
 */
export function createJourneyEditorProjectionData(journeyInput, options = {}) {
  const journey = normalizeTimedJourney(journeyInput);
  const evaluator = createTimedJourneyEvaluator(journey);
  const sampleStepSecs = Math.max(0.05, Number(options.sampleStepSecs ?? 0.5));
  const samples = evaluator.sample({ stepSecs: sampleStepSecs });
  return { journey, evaluator, samples, bounds: computeJourneyBounds(journey, samples) };
}

/**
 * @param {import('../camera-timeline.js').TimedJourney} journey
 * @param {import('../camera-timeline.js').TimedJourneyFrame[]} samples
 */
export function computeJourneyBounds(journey, samples = []) {
  const points = [
    ...journey.locationWaypoints.map((waypoint) => waypoint.positionPc),
    ...journey.cameraLookWaypoints.map((waypoint) => waypoint.kind === 'target' ? waypoint.targetPc : null).filter(Boolean),
    ...journey.guides.map((guide) => guide.positionPc).filter(Boolean),
    ...samples.map((sample) => sample.observerPc),
  ];
  if (points.length === 0) points.push({ x: 0, y: 0, z: 0 });
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const point of points) {
    for (const axis of ['x', 'y', 'z']) {
      const value = Number(point?.[axis] ?? 0);
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  const span = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 1);
  const pad = span * 0.12;
  return {
    minX: min.x - pad,
    maxX: max.x + pad,
    minY: min.y - pad,
    maxY: max.y + pad,
    minZ: min.z - pad,
    maxZ: max.z + pad,
    span: span + pad * 2,
  };
}

/**
 * @param {{ mode?: string; width: number; height: number; unitsPerParsec?: number; centerPc?: { x?: number; y?: number; z?: number } }} options
 */
export function createJourneyProjectionTransform(options) {
  const mode = options.mode === 'xz' || options.mode === 'yz' ? options.mode : 'xy';
  const axes = DEFAULT_AXES[mode];
  const width = Math.max(1, Number(options.width ?? 1));
  const height = Math.max(1, Number(options.height ?? 1));
  const unitsPerParsec = Math.max(0.001, Number(options.unitsPerParsec ?? 1));
  return {
    mode,
    axes,
    width,
    height,
    unitsPerParsec,
    centerA: Number(options.centerPc?.[axes[0]] ?? 0),
    centerB: Number(options.centerPc?.[axes[1]] ?? 0),
  };
}

/**
 * @param {{ x?: number; y?: number; z?: number }} point
 * @param {ReturnType<typeof createJourneyProjectionTransform>} transform
 */
export function projectJourneyEditorPoint(point, transform) {
  const [axisA, axisB] = transform.axes;
  return {
    x: transform.width / 2 + (Number(point?.[axisA] ?? 0) - transform.centerA) * transform.unitsPerParsec,
    y: transform.height / 2 - (Number(point?.[axisB] ?? 0) - transform.centerB) * transform.unitsPerParsec,
  };
}

/**
 * @param {{ x?: number; y?: number }} point
 * @param {ReturnType<typeof createJourneyProjectionTransform>} transform
 * @param {{ x?: number; y?: number; z?: number }} [basePoint]
 */
export function unprojectJourneyEditorPoint(point, transform, basePoint = {}) {
  const [axisA, axisB] = transform.axes;
  return {
    ...basePoint,
    [axisA]: transform.centerA + (Number(point?.x ?? 0) - transform.width / 2) / transform.unitsPerParsec,
    [axisB]: transform.centerB - (Number(point?.y ?? 0) - transform.height / 2) / transform.unitsPerParsec,
  };
}

/**
 * @param {Array<{ type: string; id: string; x: number; y: number; radius?: number }>} markers
 * @param {number} x
 * @param {number} y
 */
export function hitJourneyEditorMarker(markers, x, y) {
  let best = null;
  let bestDistance = Infinity;
  for (const marker of markers) {
    const distance = Math.hypot(marker.x - x, marker.y - y);
    if (distance <= (marker.radius ?? 10) && distance <= bestDistance) {
      best = marker;
      bestDistance = distance;
    }
  }
  return best;
}
