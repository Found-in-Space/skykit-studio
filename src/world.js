// @ts-nocheck
import * as THREE from 'three';

export const DEFAULT_JOURNEY_VIDEO_COORDINATE_UNITS_PER_PARSEC = 0.02;
export const DEFAULT_JOURNEY_VIDEO_RENDER_SCALE = 1;
export const DEFAULT_JOURNEY_VIDEO_LIMITING_MAGNITUDE = 6.5;

/**
 * Journey data is authored in parsecs. This world object is the single bridge
 * from authored parsec space into SkyKit/Three render units.
 *
 * @param {Record<string, unknown>} [input]
 */
export function createJourneyVideoWorld(input = {}) {
  return Object.freeze({
    coordinateUnitsPerParsec: positiveNumber(
      input.coordinateUnitsPerParsec,
      DEFAULT_JOURNEY_VIDEO_COORDINATE_UNITS_PER_PARSEC,
    ),
    renderScale: positiveNumber(input.renderScale, DEFAULT_JOURNEY_VIDEO_RENDER_SCALE),
    limitingMagnitude: finiteNumber(input.limitingMagnitude, DEFAULT_JOURNEY_VIDEO_LIMITING_MAGNITUDE),
  });
}

/**
 * @param {{ x?: unknown; y?: unknown; z?: unknown } | null | undefined} pointPc
 * @param {{ coordinateUnitsPerParsec: number }} world
 */
export function pointPcToRenderUnits(pointPc, world) {
  const scale = world.coordinateUnitsPerParsec;
  return {
    x: finiteNumber(pointPc?.x, 0) * scale,
    y: finiteNumber(pointPc?.y, 0) * scale,
    z: finiteNumber(pointPc?.z, 0) * scale,
  };
}

/**
 * @param {{ x?: unknown; y?: unknown; z?: unknown } | null | undefined} point
 * @param {{ coordinateUnitsPerParsec: number }} world
 */
export function renderUnitsToPointPc(point, world) {
  const scale = positiveNumber(world.coordinateUnitsPerParsec, DEFAULT_JOURNEY_VIDEO_COORDINATE_UNITS_PER_PARSEC);
  return {
    x: finiteNumber(point?.x, 0) / scale,
    y: finiteNumber(point?.y, 0) / scale,
    z: finiteNumber(point?.z, 0) / scale,
  };
}

/**
 * @param {unknown} valuePc
 * @param {{ coordinateUnitsPerParsec: number }} world
 */
export function scalarPcToRenderUnits(valuePc, world) {
  return finiteNumber(valuePc, 0) * world.coordinateUnitsPerParsec;
}

/**
 * @param {{ guides?: Iterable<Record<string, unknown>> } | Iterable<Record<string, unknown>>} journeyOrGuides
 * @param {ReturnType<typeof createJourneyVideoWorld>} world
 * @param {Record<string, unknown>} [options]
 */
export function createJourneyVideoGuideGroup(journeyOrGuides, world, options = {}) {
  const group = new THREE.Group();
  group.name = String(options.name ?? 'journey-video-guides');
  syncJourneyVideoGuideGroup(group, journeyOrGuides, world, options);
  return group;
}

/**
 * @param {THREE.Group} group
 * @param {{ guides?: Iterable<Record<string, unknown>> } | Iterable<Record<string, unknown>>} journeyOrGuides
 * @param {ReturnType<typeof createJourneyVideoWorld>} world
 * @param {Record<string, unknown>} [options]
 */
export function syncJourneyVideoGuideGroup(group, journeyOrGuides, world, options = {}) {
  disposeObjectChildren(group);
  const guides = resolveGuides(journeyOrGuides);
  for (const guide of guides) {
    group.add(createGuideMesh(guide, world, options));
  }
}

/** @param {THREE.Object3D} object */
export function disposeObjectTree(object) {
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      for (const material of child.material) material.dispose?.();
    } else {
      child.material?.dispose?.();
    }
  });
}

/** @param {THREE.Object3D} object */
export function disposeObjectChildren(object) {
  for (const child of [...object.children]) {
    object.remove(child);
    disposeObjectTree(child);
  }
}

/**
 * @param {Record<string, unknown>} guide
 * @param {ReturnType<typeof createJourneyVideoWorld>} world
 * @param {Record<string, unknown>} options
 */
function createGuideMesh(guide, world, options) {
  const opacity = clamp(
    finiteNumber(guide.opacity, finiteNumber(options.defaultOpacity, 0.45)),
    0,
    1,
  );
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorText(guide.color, String(options.defaultColor ?? '#8fd5ff'))),
    transparent: true,
    opacity,
    wireframe: options.wireframe === true || opacity < finiteNumber(options.wireframeOpacityThreshold, 0.3),
    depthWrite: options.depthWrite === true,
  });
  const sizePc = finiteNumber(guide.sizePc ?? guide.radiusPc, 1);
  const radiusPc = finiteNumber(guide.radiusPc ?? guide.sizePc, 1);
  const shape = String(guide.shape ?? 'sphere');
  const geometry = shape === 'cube'
    ? new THREE.BoxGeometry(
      Math.max(0.001, scalarPcToRenderUnits(sizePc, world)),
      Math.max(0.001, scalarPcToRenderUnits(sizePc, world)),
      Math.max(0.001, scalarPcToRenderUnits(sizePc, world)),
    )
    : new THREE.SphereGeometry(
      Math.max(0.001, scalarPcToRenderUnits(radiusPc, world)),
      Math.max(8, Math.floor(finiteNumber(options.sphereWidthSegments, 32))),
      Math.max(6, Math.floor(finiteNumber(options.sphereHeightSegments, 16))),
    );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = String(guide.id ?? guide.label ?? 'journey-guide');
  const position = pointPcToRenderUnits(/** @type {{ x?: unknown; y?: unknown; z?: unknown }} */ (guide.positionPc), world);
  mesh.position.set(position.x, position.y, position.z);
  return mesh;
}

/** @param {unknown} value */
function resolveGuides(value) {
  if (value && typeof value === 'object' && typeof value[Symbol.iterator] === 'function') {
    return Array.from(/** @type {Iterable<Record<string, unknown>>} */ (value));
  }
  const guides = /** @type {{ guides?: unknown }} */ (value)?.guides;
  return Array.isArray(guides) ? guides : [];
}

/** @param {unknown} value @param {string} fallback */
function colorText(value, fallback) {
  const text = String(value ?? '').trim();
  return /^#[0-9a-f]{6}$/iu.test(text) ? text : fallback;
}

/** @param {unknown} value @param {number} fallback */
function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/** @param {unknown} value @param {number} fallback */
function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
