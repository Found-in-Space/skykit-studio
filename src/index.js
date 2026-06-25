import {
  FIS_JOURNEY_FORMAT,
  normalizeTimedJourney,
} from './camera-timeline.js';
import {
  DEFAULT_JOURNEY_VIDEO_EDITOR_PANE_LAYOUT,
  DEFAULT_JOURNEY_VIDEO_EDITOR_PANES,
  JOURNEY_VIDEO_EDITOR_PANE_LAYOUT_PRESETS,
  JOURNEY_VIDEO_EDITOR_TILE_MODES,
  normalizeJourneyVideoEditorPaneState,
} from './editor/panes.js';

export const SKYKIT_STUDIO_PACKAGE_STATUS = 'alpha-editor';
export const DEFAULT_EDITOR_UNITS_PER_PARSEC = 3;

export const DEFAULT_JOURNEY_VIDEO_EDITOR_STATE = Object.freeze({
  panes: DEFAULT_JOURNEY_VIDEO_EDITOR_PANES,
  paneLayout: DEFAULT_JOURNEY_VIDEO_EDITOR_PANE_LAYOUT,
  tileModes: Object.freeze(DEFAULT_JOURNEY_VIDEO_EDITOR_PANES.map((pane) => pane.mode)),
  unitsPerParsec: DEFAULT_EDITOR_UNITS_PER_PARSEC,
  /** @deprecated Use paneLayout instead. */
  expandedTileIndex: null,
  freeRoamPose: null,
  selectedWidget: null,
  selectedLocationRange: null,
  selectedLocationGroupId: null,
  selectedLocationGroupPhase: null,
  easeSecs: 3,
  timeSecs: 0,
  playing: false,
});

export {
  JOURNEY_VIDEO_EDITOR_PANE_LAYOUT_PRESETS,
  JOURNEY_VIDEO_EDITOR_TILE_MODES,
};

/**
 * @param {unknown} input
 * @returns {import('./index.d.ts').JourneyVideoEditorState}
 */
export function normalizeJourneyVideoEditorState(input = {}) {
  const source = /** @type {Record<string, unknown>} */ (input && typeof input === 'object' ? input : {});
  const paneState = normalizeJourneyVideoEditorPaneState(source);
  return {
    panes: paneState.panes,
    paneLayout: paneState.paneLayout,
    tileModes: paneState.tileModes,
    unitsPerParsec: clamp(
      Number(source.unitsPerParsec ?? DEFAULT_JOURNEY_VIDEO_EDITOR_STATE.unitsPerParsec),
      0.25,
      80,
    ),
    expandedTileIndex: paneState.expandedTileIndex,
    freeRoamPose: normalizeFreeRoamPose(source.freeRoamPose),
    selectedWidget: normalizeWidgetRef(source.selectedWidget),
    selectedLocationRange: normalizeLocationRange(source.selectedLocationRange),
    selectedLocationGroupId: typeof source.selectedLocationGroupId === 'string' ? source.selectedLocationGroupId : null,
    selectedLocationGroupPhase: source.selectedLocationGroupPhase === 'start' || source.selectedLocationGroupPhase === 'end'
      ? source.selectedLocationGroupPhase
      : null,
    easeSecs: clamp(
      Number(source.easeSecs ?? DEFAULT_JOURNEY_VIDEO_EDITOR_STATE.easeSecs),
      0.05,
      60,
    ),
    timeSecs: Math.max(0, finiteNumber(source.timeSecs, 0)),
    playing: source.playing === true,
  };
}

/**
 * @param {{ journey?: unknown; editorState?: unknown; metadata?: Record<string, unknown> }} [options]
 * @returns {import('./index.d.ts').JourneyVideoEditorDocument}
 */
export function createJourneyVideoEditorDocument(options = {}) {
  return {
    format: 'fis-journey-video-editor-v1',
    journey: normalizeTimedJourney(options.journey ?? {}),
    editorState: normalizeJourneyVideoEditorState(options.editorState),
    metadata: { ...(options.metadata ?? {}) },
  };
}

/** @param {import('./index.d.ts').JourneyVideoEditorDocument} document */
export function exportJourneyVideoEditorDocument(document) {
  return `${JSON.stringify(createJourneyVideoEditorDocument(document), null, 2)}\n`;
}

/** @param {string | unknown} input */
export function importJourneyVideoEditorDocument(input) {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  const source = /** @type {Record<string, unknown>} */ (parsed && typeof parsed === 'object' ? parsed : {});
  if (source.format === 'fis-journey-video-editor-v1') {
    return createJourneyVideoEditorDocument({
      journey: source.journey,
      editorState: source.editorState,
      metadata: /** @type {Record<string, unknown>} */ (source.metadata ?? {}),
    });
  }
  if (source.format === FIS_JOURNEY_FORMAT || source.locationWaypoints || source.cameraLookWaypoints) {
    return createJourneyVideoEditorDocument({ journey: source });
  }
  throw new TypeError('Journey video editor documents require fis-journey-v1 or fis-journey-video-editor-v1 data.');
}

/**
 * @param {{ getItem?: Function; setItem?: Function; removeItem?: Function } | null | undefined} storage
 * @param {string} key
 */
export function createJourneyVideoStorage(storage, key = 'fis-journey-video-editor') {
  return {
    load() {
      if (!storage || typeof storage.getItem !== 'function') return null;
      const raw = storage.getItem(key);
      return raw ? importJourneyVideoEditorDocument(String(raw)) : null;
    },
    save(document) {
      if (!storage || typeof storage.setItem !== 'function') return;
      storage.setItem(key, exportJourneyVideoEditorDocument(document));
    },
    clear() {
      if (!storage || typeof storage.removeItem !== 'function') return;
      storage.removeItem(key);
    },
  };
}

/** @param {unknown} value */
function normalizeFreeRoamPose(value) {
  if (!value || typeof value !== 'object') return null;
  const source = /** @type {Record<string, unknown>} */ (value);
  if (!source.observerPc || typeof source.observerPc !== 'object') return null;
  return {
    observerPc: clonePoint(source.observerPc),
    orientationIcrs: cloneQuaternion(source.orientationIcrs),
  };
}

/** @param {unknown} value */
function normalizeWidgetRef(value) {
  if (!value || typeof value !== 'object') return null;
  const source = /** @type {Record<string, unknown>} */ (value);
  const type = String(source.type ?? '');
  const id = String(source.id ?? '');
  return ['location', 'camera', 'guide'].includes(type) && id ? { type, id } : null;
}

/** @param {unknown} value */
function normalizeLocationRange(value) {
  if (!value || typeof value !== 'object') return null;
  const source = /** @type {Record<string, unknown>} */ (value);
  const anchorId = typeof source.anchorId === 'string' ? source.anchorId : null;
  const focusId = typeof source.focusId === 'string' ? source.focusId : null;
  return anchorId && focusId && anchorId !== focusId ? { anchorId, focusId } : null;
}

/** @param {unknown} point */
function clonePoint(point) {
  const source = /** @type {Record<string, unknown>} */ (point && typeof point === 'object' ? point : {});
  return {
    x: finiteNumber(source.x, 0),
    y: finiteNumber(source.y, 0),
    z: finiteNumber(source.z, 0),
  };
}

/** @param {unknown} quaternion */
function cloneQuaternion(quaternion) {
  const source = /** @type {Record<string, unknown>} */ (quaternion && typeof quaternion === 'object' ? quaternion : {});
  return {
    x: finiteNumber(source.x, 0),
    y: finiteNumber(source.y, 0),
    z: finiteNumber(source.z, 0),
    w: finiteNumber(source.w, 1),
  };
}

/** @param {unknown} value @param {number} fallback */
function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
