// @ts-nocheck

export const JOURNEY_VIDEO_EDITOR_TILE_MODES = Object.freeze([
  'xy',
  'xz',
  'yz',
  'perspective',
  'preview',
  'free-roam',
]);

export const JOURNEY_VIDEO_EDITOR_PANE_LAYOUT_PRESETS = Object.freeze([
  'single',
  'two-stacked',
  'two-side-by-side',
  'three-primary-left',
  'three-primary-right',
  'four-grid',
]);

export const DEFAULT_JOURNEY_VIDEO_EDITOR_PANES = Object.freeze([
  Object.freeze({ id: 'pane-1', mode: 'xy' }),
  Object.freeze({ id: 'pane-2', mode: 'xz' }),
  Object.freeze({ id: 'pane-3', mode: 'perspective' }),
  Object.freeze({ id: 'pane-4', mode: 'preview' }),
]);

export const DEFAULT_JOURNEY_VIDEO_EDITOR_PANE_LAYOUT = Object.freeze({
  preset: 'four-grid',
  paneIds: Object.freeze(DEFAULT_JOURNEY_VIDEO_EDITOR_PANES.map((pane) => pane.id)),
  primaryPaneId: DEFAULT_JOURNEY_VIDEO_EDITOR_PANES[0].id,
  previousLayout: null,
});

const MAX_PANES = 4;
const PANE_AREAS = Object.freeze(['pane-a', 'pane-b', 'pane-c', 'pane-d']);
const PRESET_COUNTS = Object.freeze({
  single: 1,
  'two-stacked': 2,
  'two-side-by-side': 2,
  'three-primary-left': 3,
  'three-primary-right': 3,
  'four-grid': 4,
});

/**
 * @param {unknown} input
 * @returns {{ panes: Array<{ id: string; mode: string }>; paneLayout: Record<string, unknown>; tileModes: string[]; expandedTileIndex: number | null }}
 */
export function normalizeJourneyVideoEditorPaneState(input = {}) {
  const source = /** @type {Record<string, unknown>} */ (input && typeof input === 'object' ? input : {});
  const panes = normalizeJourneyVideoEditorPanes(source.panes, source.tileModes);
  const paneLayout = normalizeJourneyVideoEditorPaneLayout(source.paneLayout, panes, {
    expandedTileIndex: source.expandedTileIndex,
  });
  return syncPaneAliases({ panes, paneLayout });
}

/**
 * @param {unknown} input
 * @param {unknown} legacyTileModes
 */
export function normalizeJourneyVideoEditorPanes(input, legacyTileModes = undefined) {
  const panes = [];
  const usedIds = new Set();
  if (Array.isArray(input)) {
    for (const [index, entry] of input.slice(0, MAX_PANES).entries()) {
      const source = /** @type {Record<string, unknown>} */ (entry && typeof entry === 'object' ? entry : {});
      const fallback = DEFAULT_JOURNEY_VIDEO_EDITOR_PANES[index]?.mode ?? 'xy';
      const id = uniquePaneId(source.id, usedIds, index);
      panes.push({
        id,
        mode: normalizeJourneyVideoTileMode(source.mode, fallback),
      });
      usedIds.add(id);
    }
  }
  if (panes.length > 0) return panes;
  const legacyModes = legacyTileModesFromInput(legacyTileModes);
  for (const [index, mode] of legacyModes.entries()) {
    panes.push({
      id: DEFAULT_JOURNEY_VIDEO_EDITOR_PANES[index]?.id ?? `pane-${index + 1}`,
      mode: normalizeJourneyVideoTileMode(mode, DEFAULT_JOURNEY_VIDEO_EDITOR_PANES[index]?.mode ?? 'xy'),
    });
  }
  return panes;
}

/**
 * @param {unknown} input
 * @param {Array<{ id: string; mode: string }>} panes
 * @param {{ expandedTileIndex?: unknown; allowPrevious?: boolean }} [options]
 */
export function normalizeJourneyVideoEditorPaneLayout(input, panes, options = {}) {
  const availableIds = panes.map((pane) => pane.id);
  if (availableIds.length === 0) {
    return clonePaneLayout(DEFAULT_JOURNEY_VIDEO_EDITOR_PANE_LAYOUT);
  }
  const source = /** @type {Record<string, unknown>} */ (input && typeof input === 'object' ? input : {});
  if (!input || typeof input !== 'object') {
    const expandedIndex = normalizeLegacyExpandedTileIndex(options.expandedTileIndex, panes);
    if (expandedIndex !== null) {
      const primaryPaneId = panes[expandedIndex].id;
      return {
        preset: 'single',
        paneIds: [primaryPaneId],
        primaryPaneId,
        previousLayout: layoutWithoutPrevious(defaultPresetForCount(availableIds.length), availableIds, availableIds[0]),
      };
    }
    const preset = defaultPresetForCount(availableIds.length);
    return layoutWithoutPrevious(preset, availableIds.slice(0, countForPreset(preset)), availableIds[0]);
  }

  let preset = normalizePaneLayoutPreset(source.preset);
  const requestedIds = normalizePaneIdList(source.paneIds, availableIds);
  const sourcePrimary = typeof source.primaryPaneId === 'string' && availableIds.includes(source.primaryPaneId)
    ? source.primaryPaneId
    : null;
  if (!preset) {
    const requestedCount = requestedIds.length || availableIds.length;
    preset = defaultPresetForCount(Math.min(requestedCount, availableIds.length));
  }
  if (countForPreset(preset) > availableIds.length) preset = defaultPresetForCount(availableIds.length);

  const count = Math.min(countForPreset(preset), availableIds.length);
  const paneIds = fillPaneIds(requestedIds, availableIds, count);
  let primaryPaneId = sourcePrimary && paneIds.includes(sourcePrimary) ? sourcePrimary : paneIds[0];
  if (preset === 'single') {
    const singlePaneId = sourcePrimary ?? paneIds[0] ?? availableIds[0];
    paneIds.splice(0, paneIds.length, singlePaneId);
    primaryPaneId = singlePaneId;
  }

  const previousLayout = preset === 'single' && options.allowPrevious !== false
    ? normalizePreviousLayout(source.previousLayout, panes)
    : null;
  return {
    preset,
    paneIds,
    primaryPaneId,
    previousLayout,
  };
}

/** @param {unknown} mode @param {string} fallback */
export function normalizeJourneyVideoTileMode(mode, fallback = 'xy') {
  const text = String(mode ?? '');
  if (text === 'skykit') return 'preview';
  return JOURNEY_VIDEO_EDITOR_TILE_MODES.includes(text) ? text : fallback;
}

/** @param {unknown} preset */
export function normalizePaneLayoutPreset(preset) {
  const text = String(preset ?? '');
  return JOURNEY_VIDEO_EDITOR_PANE_LAYOUT_PRESETS.includes(text) ? text : null;
}

/** @param {Record<string, unknown>} state @param {unknown} paneId @param {unknown} mode */
export function setEditorPaneMode(state, paneId, mode) {
  const paneState = normalizeJourneyVideoEditorPaneState(state);
  const normalizedMode = normalizeJourneyVideoTileMode(mode, null);
  if (!normalizedMode || !paneState.panes.some((pane) => pane.id === paneId)) return mergePaneState(state, paneState);
  const panes = paneState.panes.map((pane) => (
    pane.id === paneId ? { ...pane, mode: normalizedMode } : pane
  ));
  return mergePaneState(state, syncPaneAliases({
    panes,
    paneLayout: normalizeJourneyVideoEditorPaneLayout(paneState.paneLayout, panes),
  }));
}

/** @param {Record<string, unknown>} state @param {unknown} index @param {unknown} mode */
export function setEditorTileMode(state, index, mode) {
  const paneState = normalizeJourneyVideoEditorPaneState(state);
  const normalizedMode = normalizeJourneyVideoTileMode(mode, null);
  if (!normalizedMode) return mergePaneState(state, paneState);
  const targetIndex = clampInteger(index, 0, MAX_PANES - 1);
  const panes = ensurePaneCount(paneState.panes, targetIndex + 1);
  panes[targetIndex] = { ...panes[targetIndex], mode: normalizedMode };
  return mergePaneState(state, syncPaneAliases({
    panes,
    paneLayout: normalizeJourneyVideoEditorPaneLayout(paneState.paneLayout, panes),
  }));
}

/** @param {Record<string, unknown>} state @param {unknown} mode */
export function addEditorPane(state, mode = 'xy') {
  const paneState = normalizeJourneyVideoEditorPaneState(state);
  if (paneState.panes.length >= MAX_PANES) {
    return { state: mergePaneState(state, paneState), paneId: null };
  }
  const id = nextPaneId(paneState.panes);
  const panes = [
    ...paneState.panes,
    { id, mode: normalizeJourneyVideoTileMode(mode, DEFAULT_JOURNEY_VIDEO_EDITOR_PANES[paneState.panes.length]?.mode ?? 'xy') },
  ];
  const visibleIds = fillPaneIds([...paneState.paneLayout.paneIds, id], panes.map((pane) => pane.id), panes.length);
  const preset = defaultPresetForCount(visibleIds.length);
  return {
    paneId: id,
    state: mergePaneState(state, syncPaneAliases({
      panes,
      paneLayout: layoutWithoutPrevious(preset, visibleIds, paneState.paneLayout.primaryPaneId ?? visibleIds[0]),
    })),
  };
}

/** @param {Record<string, unknown>} state @param {unknown} paneId */
export function removeEditorPane(state, paneId) {
  const paneState = normalizeJourneyVideoEditorPaneState(state);
  if (paneState.panes.length <= 1 || !paneState.panes.some((pane) => pane.id === paneId)) {
    return mergePaneState(state, paneState);
  }
  const panes = paneState.panes.filter((pane) => pane.id !== paneId);
  const availableIds = panes.map((pane) => pane.id);
  const remainingVisible = paneState.paneLayout.paneIds.filter((id) => id !== paneId && availableIds.includes(id));
  const visibleIds = fillPaneIds(remainingVisible, availableIds, Math.min(remainingVisible.length || 1, availableIds.length));
  const preset = compatiblePresetForCount(paneState.paneLayout.preset, visibleIds.length);
  const primaryPaneId = visibleIds.includes(paneState.paneLayout.primaryPaneId)
    ? paneState.paneLayout.primaryPaneId
    : visibleIds[0];
  return mergePaneState(state, syncPaneAliases({
    panes,
    paneLayout: layoutWithoutPrevious(preset, visibleIds, primaryPaneId),
  }));
}

/**
 * @param {Record<string, unknown>} state
 * @param {unknown} preset
 * @param {unknown} paneIds
 */
export function setEditorPaneLayout(state, preset, paneIds = undefined) {
  const paneState = normalizeJourneyVideoEditorPaneState(state);
  const normalizedPreset = normalizePaneLayoutPreset(preset) ?? defaultPresetForCount(paneState.panes.length);
  const availableIds = paneState.panes.map((pane) => pane.id);
  const requestedIds = Array.isArray(paneIds)
    ? normalizePaneIdList(paneIds, availableIds)
    : [...paneState.paneLayout.paneIds];
  const count = Math.min(countForPreset(normalizedPreset), availableIds.length);
  const visibleIds = normalizedPreset === 'single'
    ? [requestedIds[0] ?? paneState.paneLayout.primaryPaneId ?? availableIds[0]]
    : fillPaneIds(requestedIds, availableIds, count);
  const nextLayout = normalizeJourneyVideoEditorPaneLayout({
    preset: normalizedPreset,
    paneIds: visibleIds,
    primaryPaneId: visibleIds[0],
    previousLayout: normalizedPreset === 'single' && paneState.paneLayout.preset !== 'single'
      ? stripPreviousLayout(paneState.paneLayout)
      : paneState.paneLayout.previousLayout,
  }, paneState.panes);
  return mergePaneState(state, syncPaneAliases({
    panes: paneState.panes,
    paneLayout: nextLayout,
  }));
}

/** @param {Record<string, unknown>} state */
export function restoreEditorPaneLayout(state) {
  const paneState = normalizeJourneyVideoEditorPaneState(state);
  if (paneState.paneLayout.preset !== 'single') return mergePaneState(state, paneState);
  const previous = paneState.paneLayout.previousLayout;
  const paneLayout = previous
    ? normalizeJourneyVideoEditorPaneLayout(previous, paneState.panes, { allowPrevious: false })
    : normalizeJourneyVideoEditorPaneLayout(null, paneState.panes);
  return mergePaneState(state, syncPaneAliases({
    panes: paneState.panes,
    paneLayout,
  }));
}

/** @param {Record<string, unknown>} state @param {unknown} index */
export function setEditorExpandedTileIndex(state, index) {
  const paneState = normalizeJourneyVideoEditorPaneState(state);
  if (index === null || index === undefined || index === '') {
    return restoreEditorPaneLayout(state);
  }
  const targetIndex = clampInteger(index, 0, MAX_PANES - 1);
  const panes = ensurePaneCount(paneState.panes, targetIndex + 1);
  const paneId = panes[targetIndex].id;
  return mergePaneState(state, syncPaneAliases({
    panes,
    paneLayout: normalizeJourneyVideoEditorPaneLayout({
      preset: 'single',
      paneIds: [paneId],
      primaryPaneId: paneId,
      previousLayout: paneState.paneLayout.preset === 'single'
        ? paneState.paneLayout.previousLayout
        : stripPreviousLayout(paneState.paneLayout),
    }, panes),
  }));
}

/** @param {Record<string, unknown>} state @param {unknown} paneId @param {unknown} direction */
export function moveEditorPane(state, paneId, direction) {
  const paneState = normalizeJourneyVideoEditorPaneState(state);
  const delta = directionDelta(direction);
  if (!delta) return mergePaneState(state, paneState);
  const panes = moveIdInCollection(paneState.panes, paneId, delta, (pane) => pane.id);
  const paneIds = moveIdInCollection(paneState.paneLayout.paneIds, paneId, delta, (id) => id);
  return mergePaneState(state, syncPaneAliases({
    panes,
    paneLayout: normalizeJourneyVideoEditorPaneLayout({
      ...paneState.paneLayout,
      paneIds,
    }, panes),
  }));
}

/** @param {Record<string, unknown>} state */
export function resolveJourneyVideoPaneLayout(state) {
  const paneState = normalizeJourneyVideoEditorPaneState(state);
  const paneById = new Map(paneState.panes.map((pane) => [pane.id, pane]));
  const slots = paneState.paneLayout.paneIds
    .map((paneId, index) => ({
      pane: paneById.get(paneId),
      index,
      area: PANE_AREAS[index] ?? PANE_AREAS[0],
    }))
    .filter((slot) => slot.pane);
  return {
    ...paneState.paneLayout,
    slots,
  };
}

/** @param {Record<string, unknown>} layout */
export function stripPreviousLayout(layout) {
  return {
    preset: layout.preset,
    paneIds: [...(Array.isArray(layout.paneIds) ? layout.paneIds : [])],
    primaryPaneId: layout.primaryPaneId ?? null,
    previousLayout: null,
  };
}

/** @param {unknown} preset */
export function countForPreset(preset) {
  return PRESET_COUNTS[preset] ?? MAX_PANES;
}

/** @param {number} count */
export function defaultPresetForCount(count) {
  if (count <= 1) return 'single';
  if (count === 2) return 'two-side-by-side';
  if (count === 3) return 'three-primary-left';
  return 'four-grid';
}

/** @param {Array<{ id: string; mode: string }>} panes */
export function paneModesFromPanes(panes) {
  return panes.slice(0, MAX_PANES).map((pane) => normalizeJourneyVideoTileMode(pane.mode, 'xy'));
}

/** @param {Record<string, unknown>} layout @param {Array<{ id: string; mode: string }>} panes */
export function expandedTileIndexFromPaneLayout(layout, panes) {
  if (layout?.preset !== 'single') return null;
  const index = panes.findIndex((pane) => pane.id === layout.primaryPaneId);
  return index >= 0 ? index : null;
}

function legacyTileModesFromInput(input) {
  const modes = Array.isArray(input) && input.length > 0
    ? input.slice(0, MAX_PANES)
    : DEFAULT_JOURNEY_VIDEO_EDITOR_PANES.map((pane) => pane.mode);
  while (modes.length < MAX_PANES) {
    modes.push(DEFAULT_JOURNEY_VIDEO_EDITOR_PANES[modes.length]?.mode ?? 'xy');
  }
  return modes.slice(0, MAX_PANES);
}

function syncPaneAliases({ panes, paneLayout }) {
  const normalizedPanes = normalizeJourneyVideoEditorPanes(panes);
  const normalizedLayout = normalizeJourneyVideoEditorPaneLayout(paneLayout, normalizedPanes);
  return {
    panes: normalizedPanes,
    paneLayout: normalizedLayout,
    tileModes: paneModesFromPanes(normalizedPanes),
    expandedTileIndex: expandedTileIndexFromPaneLayout(normalizedLayout, normalizedPanes),
  };
}

function mergePaneState(state, paneState) {
  return {
    ...state,
    panes: paneState.panes,
    paneLayout: paneState.paneLayout,
    tileModes: paneState.tileModes,
    expandedTileIndex: paneState.expandedTileIndex,
  };
}

function normalizePreviousLayout(input, panes) {
  if (!input || typeof input !== 'object') return null;
  const previous = normalizeJourneyVideoEditorPaneLayout(input, panes, { allowPrevious: false });
  return previous.preset === 'single' ? null : stripPreviousLayout(previous);
}

function layoutWithoutPrevious(preset, paneIds, primaryPaneId) {
  const ids = [...paneIds];
  return {
    preset,
    paneIds: ids,
    primaryPaneId: ids.includes(primaryPaneId) ? primaryPaneId : ids[0],
    previousLayout: null,
  };
}

function compatiblePresetForCount(previousPreset, count) {
  if (countForPreset(previousPreset) === count && previousPreset !== 'single') return previousPreset;
  return defaultPresetForCount(count);
}

function normalizePaneIdList(input, availableIds) {
  if (!Array.isArray(input)) return [];
  const ids = [];
  for (const raw of input) {
    const id = String(raw ?? '');
    if (availableIds.includes(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function fillPaneIds(requestedIds, availableIds, count) {
  const ids = [];
  for (const id of requestedIds) {
    if (availableIds.includes(id) && !ids.includes(id)) ids.push(id);
    if (ids.length >= count) return ids;
  }
  for (const id of availableIds) {
    if (!ids.includes(id)) ids.push(id);
    if (ids.length >= count) return ids;
  }
  return ids;
}

function normalizeLegacyExpandedTileIndex(value, panes) {
  if (value === null || value === undefined || value === '') return null;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < Math.min(MAX_PANES, panes.length) ? index : null;
}

function uniquePaneId(input, usedIds, index) {
  const requested = typeof input === 'string' && input.trim() ? input.trim() : '';
  if (requested && !usedIds.has(requested)) return requested;
  let fallback = DEFAULT_JOURNEY_VIDEO_EDITOR_PANES[index]?.id ?? `pane-${index + 1}`;
  let suffix = index + 1;
  while (usedIds.has(fallback)) {
    suffix += 1;
    fallback = `pane-${suffix}`;
  }
  return fallback;
}

function nextPaneId(panes) {
  const usedIds = new Set(panes.map((pane) => pane.id));
  let index = 1;
  while (usedIds.has(`pane-${index}`)) index += 1;
  return `pane-${index}`;
}

function ensurePaneCount(inputPanes, count) {
  const panes = normalizeJourneyVideoEditorPanes(inputPanes);
  const usedIds = new Set(panes.map((pane) => pane.id));
  while (panes.length < Math.min(MAX_PANES, count)) {
    const index = panes.length;
    const id = uniquePaneId(null, usedIds, index);
    panes.push({
      id,
      mode: DEFAULT_JOURNEY_VIDEO_EDITOR_PANES[index]?.mode ?? 'xy',
    });
    usedIds.add(id);
  }
  return panes;
}

function moveIdInCollection(collection, targetId, delta, getId) {
  const items = [...collection];
  const index = items.findIndex((item) => getId(item) === targetId);
  if (index < 0) return items;
  const nextIndex = Math.max(0, Math.min(items.length - 1, index + delta));
  if (nextIndex === index) return items;
  const [item] = items.splice(index, 1);
  items.splice(nextIndex, 0, item);
  return items;
}

function directionDelta(direction) {
  const text = String(direction ?? '');
  if (text === 'previous' || text === 'left' || text === 'up') return -1;
  if (text === 'next' || text === 'right' || text === 'down') return 1;
  return 0;
}

function clampInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function clonePaneLayout(layout) {
  return {
    preset: layout.preset,
    paneIds: [...layout.paneIds],
    primaryPaneId: layout.primaryPaneId,
    previousLayout: layout.previousLayout ? clonePaneLayout(layout.previousLayout) : null,
  };
}
