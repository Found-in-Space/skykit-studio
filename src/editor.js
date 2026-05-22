// @ts-nocheck

import {
  createTimedJourneyEvaluator,
  normalizeTimedJourney,
} from '@found-in-space/journey';
import {
  deleteTimedJourneyEaseGroup,
  easeTimedJourneyLocationRange,
  equalizeTimedJourneyLocationRangeSpeed,
  rebuildTimedJourneyEaseGroup,
} from '@found-in-space/journey/authoring';

import {
  createJourneyVideoEditorDocument,
  exportJourneyVideoEditorDocument,
  importJourneyVideoEditorDocument,
  normalizeJourneyVideoEditorState,
} from './index.js';
import { createJourneyVideoWorld } from './world.js';
import {
  createCameraWaypointForFrame,
  createCameraWaypointMarkers,
  patchCameraWaypoint,
} from './editor/camera-waypoints.js';
import { createJourneyVideoEditorView } from './editor/views.js';
import {
  computeJourneyBounds,
} from './editor/projection.js';

const SAMPLE_STEP_SECS = 0.5;
const TIMELINE_STEP_SECS = 0.05;
const TILE_MODES = ['xy', 'xz', 'yz', 'perspective', 'skykit'];
/**
 * @param {import('./editor.d.ts').CreateJourneyVideoEditorOptions} [options]
 * @returns {import('./editor.d.ts').JourneyVideoEditor}
 */
export function createJourneyVideoEditor(options = {}) {
  const model = createEditorModel(options);
  const mount = options.host ? mountEditor(options.host, model, options) : null;
  return {
    setJourney(nextJourney) {
      model.setJourney(nextJourney);
      mount?.renderAll();
    },
    getJourney() {
      return model.getJourney();
    },
    evaluateAt(timeSecs) {
      return model.evaluateAt(timeSecs);
    },
    setTime(timeSecs) {
      model.setTime(timeSecs);
      mount?.renderAll();
    },
    play() {
      model.play();
      mount?.startLoop();
      mount?.renderAll();
    },
    pause() {
      model.pause();
      mount?.renderAll();
    },
    setTileMode(index, mode) {
      model.setTileMode(index, mode);
      mount?.renderAll();
    },
    setUnitsPerParsec(unitsPerParsec) {
      model.setUnitsPerParsec(unitsPerParsec);
      mount?.renderAll();
    },
    selectWidget(type, id) {
      model.selectWidget(type, id);
      mount?.renderAll();
    },
    getSnapshot() {
      return model.getSnapshot();
    },
    async dispose() {
      model.dispose();
      await mount?.dispose();
    },
  };
}

/**
 * Internal editor store. Tile views only see immutable snapshots from here and
 * send mutations back through dispatch actions.
 *
 * @param {import('./editor.d.ts').CreateJourneyVideoEditorOptions} options
 */
function createEditorModel(options) {
  let document = options.document
    ? importJourneyVideoEditorDocument(options.document)
    : createJourneyVideoEditorDocument({
      journey: options.journey,
      editorState: options.editorState,
    });
  let journey = document.journey;
  let state = normalizeJourneyVideoEditorState(document.editorState);
  let evaluator = createTimedJourneyEvaluator(journey);
  let samples = evaluator.sample({ stepSecs: SAMPLE_STEP_SECS });
  let evaluated = evaluator.evaluate(state.timeSecs);
  const world = createJourneyVideoWorld(options.preview);
  let disposed = false;

  function persist() {
    document = createJourneyVideoEditorDocument({ journey, editorState: state, metadata: document.metadata });
    options.storage?.save?.(document);
    options.onChange?.(document);
  }

  function rebuild({ persistDocument = true } = {}) {
    evaluator = createTimedJourneyEvaluator(journey);
    samples = evaluator.sample({ stepSecs: SAMPLE_STEP_SECS });
    state.timeSecs = clamp(state.timeSecs, 0, journey.durationSecs);
    evaluated = evaluator.evaluate(state.timeSecs);
    if (persistDocument) persist();
    else document = createJourneyVideoEditorDocument({ journey, editorState: state, metadata: document.metadata });
  }

  return {
    get journey() { return journey; },
    get state() { return state; },
    get evaluator() { return evaluator; },
    get samples() { return samples; },
    get evaluated() { return evaluated; },
    get world() { return world; },
    setJourney(nextJourney) {
      assertActive();
      journey = normalizeTimedJourney(nextJourney);
      state.selectedWidget = null;
      state.selectedLocationRange = null;
      state.selectedLocationGroupId = null;
      state.selectedLocationGroupPhase = null;
      rebuild();
    },
    loadDocument(nextDocument) {
      assertActive();
      document = importJourneyVideoEditorDocument(nextDocument);
      journey = document.journey;
      state = normalizeJourneyVideoEditorState(document.editorState);
      rebuild();
    },
    getJourney() {
      return normalizeTimedJourney(journey);
    },
    evaluateAt(timeSecs) {
      return evaluator.evaluate(timeSecs);
    },
    setTime(timeSecs) {
      assertActive();
      state.timeSecs = clamp(snapTime(timeSecs), 0, journey.durationSecs);
      evaluated = evaluator.evaluate(state.timeSecs);
      persist();
    },
    play() {
      assertActive();
      state.playing = true;
      persist();
    },
    pause() {
      state.playing = false;
      if (!disposed) persist();
    },
    tick(deltaSeconds) {
      if (!state.playing) return;
      const next = state.timeSecs + Math.max(0, Number(deltaSeconds) || 0);
      this.setTime(next >= journey.durationSecs ? 0 : next);
    },
    setTileMode(index, mode) {
      assertActive();
      if (!TILE_MODES.includes(mode)) return;
      state.tileModes[Math.max(0, Math.min(3, Number(index) || 0))] = mode;
      persist();
    },
    setDuration(durationSecs) {
      assertActive();
      journey = normalizeTimedJourney({
        ...journey,
        durationSecs: Math.max(0.1, Number(durationSecs) || journey.durationSecs),
      });
      rebuild();
    },
    setUnitsPerParsec(unitsPerParsec) {
      assertActive();
      state.unitsPerParsec = clamp(Number(unitsPerParsec), 0.25, 80);
      persist();
    },
    setEaseSecs(easeSecs) {
      assertActive();
      state.easeSecs = clamp(Number(easeSecs), TIMELINE_STEP_SECS, 60);
      persist();
    },
    selectWidget(type, id, options = {}) {
      assertActive();
      const ref = findWidget(journey, type, id);
      if (!ref) {
        state.selectedWidget = null;
        state.selectedLocationRange = null;
        return;
      }
      if (options.extendRange && ref.type === 'location' && state.selectedWidget?.type === 'location') {
        state.selectedLocationRange = { anchorId: state.selectedWidget.id, focusId: ref.id };
      } else if (!options.keepRange) {
        state.selectedLocationRange = null;
      }
      state.selectedWidget = ref;
      persist();
    },
    updateSelectedPoint(point) {
      const selected = state.selectedWidget;
      if (!selected) return;
      updateWidgetPoint(selected.type, selected.id, point);
    },
    updateWidgetPoint(type, id, point) {
      updateWidgetPoint(type, id, point);
    },
    updateWidgetTime(type, id, timeSecs) {
      const target = findMutableWidget(journey, type, id);
      if (!target || !('timeSecs' in target)) return;
      target.timeSecs = snapTime(clamp(Number(timeSecs), 0, journey.durationSecs));
      if (type === 'location') journey = { ...journey, locationWaypoints: sortByTime(journey.locationWaypoints) };
      if (type === 'camera') journey = { ...journey, cameraLookWaypoints: sortByTime(journey.cameraLookWaypoints) };
      rebuild();
    },
    patchWidget(type, id, patch) {
      patchWidget(type, id, patch);
    },
    addLocation() {
      const frame = evaluated;
      const waypoint = {
        id: nextId(journey.locationWaypoints, 'loc'),
        timeSecs: state.timeSecs,
        positionPc: { ...frame.observerPc },
      };
      journey = {
        ...journey,
        locationWaypoints: sortByTime([...journey.locationWaypoints, waypoint]),
      };
      state.selectedWidget = { type: 'location', id: waypoint.id };
      rebuild();
    },
    addCamera() {
      const waypoint = createCameraWaypointForFrame(
        nextId(journey.cameraLookWaypoints, 'cam'),
        state.timeSecs,
        evaluated,
        'direction',
      );
      journey = {
        ...journey,
        cameraLookWaypoints: sortByTime([...journey.cameraLookWaypoints, waypoint]),
      };
      state.selectedWidget = { type: 'camera', id: waypoint.id };
      rebuild();
    },
    addGuide() {
      const frame = evaluated;
      const guide = {
        id: nextId(journey.guides, 'guide'),
        label: `Guide ${journey.guides.length + 1}`,
        shape: 'sphere',
        positionPc: { ...frame.observerPc },
        radiusPc: 5,
        sizePc: 5,
        color: '#8fd5ff',
        opacity: 0.45,
      };
      journey = { ...journey, guides: [...journey.guides, guide] };
      state.selectedWidget = { type: 'guide', id: guide.id };
      rebuild();
    },
    deleteSelected() {
      const selected = state.selectedWidget;
      if (!selected) return;
      deleteWidget(selected.type, selected.id);
    },
    deleteWidget(type, id) {
      deleteWidget(type, id);
    },
    equalizeLocationRange(anchorId, focusId) {
      const result = equalizeTimedJourneyLocationRangeSpeed(journey, {
        anchorId,
        focusId,
        timeStepSecs: TIMELINE_STEP_SECS,
      });
      journey = result.journey;
      state.selectedLocationRange = { anchorId, focusId };
      rebuild();
    },
    easeLocationRange(anchorId, focusId) {
      const result = easeTimedJourneyLocationRange(journey, {
        anchorId,
        focusId,
        easeSecs: state.easeSecs,
        rampSampleSecs: 0.5,
        timeStepSecs: TIMELINE_STEP_SECS,
      });
      journey = result.journey;
      state.selectedLocationRange = { anchorId, focusId };
      state.selectedLocationGroupId = result.startGroupId ?? null;
      state.selectedLocationGroupPhase = result.startGroupId ? 'start' : null;
      rebuild();
    },
    rebuildEaseGroup(groupId, phase) {
      const result = rebuildTimedJourneyEaseGroup(journey, groupId, {
        phase,
        easeSecs: state.easeSecs,
        rampSampleSecs: 0.5,
        timeStepSecs: TIMELINE_STEP_SECS,
      });
      journey = result.journey;
      state.selectedLocationGroupId = groupId;
      state.selectedLocationGroupPhase = phase === 'start' || phase === 'end' ? phase : null;
      if (result.before?.startId && result.before?.endId) {
        state.selectedLocationRange = { anchorId: result.before.startId, focusId: result.before.endId };
      }
      rebuild();
    },
    deleteEaseHelpers(groupId, phase) {
      const result = deleteTimedJourneyEaseGroup(journey, groupId, { phase });
      journey = result.journey;
      state.selectedLocationGroupId = null;
      state.selectedLocationGroupPhase = null;
      rebuild();
    },
    selectLocationGroup(groupId, phase) {
      state.selectedLocationGroupId = typeof groupId === 'string' ? groupId : null;
      state.selectedLocationGroupPhase = phase === 'start' || phase === 'end' ? phase : null;
      persist();
    },
    applyJourney(nextJourney) {
      journey = normalizeTimedJourney(nextJourney);
      rebuild();
    },
    exportDocument() {
      return exportJourneyVideoEditorDocument(document);
    },
    getViewSnapshot(ui = {}) {
      return createEditorViewSnapshot(journey, state, evaluator, evaluated, samples, world, ui);
    },
    getSnapshot() {
      return {
        disposed,
        journeyId: journey.id,
        title: journey.title,
        durationSecs: journey.durationSecs,
        timeSecs: state.timeSecs,
        playing: state.playing,
        tileModes: [...state.tileModes],
        selectedWidget: state.selectedWidget ? { ...state.selectedWidget } : null,
        selectedLocationRange: state.selectedLocationRange ? { ...state.selectedLocationRange } : null,
        selectedLocationGroupId: state.selectedLocationGroupId,
        selectedLocationGroupPhase: state.selectedLocationGroupPhase,
        easeSecs: state.easeSecs,
        locationWaypointCount: journey.locationWaypoints.length,
        cameraWaypointCount: journey.cameraLookWaypoints.length,
        guideCount: journey.guides.length,
      };
    },
    dispose() {
      disposed = true;
      state.playing = false;
    },
  };

  function updateWidgetPoint(type, id, point) {
    const target = findMutableWidget(journey, type, id);
    if (!target) return;
    const nextPoint = clonePoint(point);
    if (type === 'location') target.positionPc = nextPoint;
    if (type === 'guide') target.positionPc = nextPoint;
    if (type === 'camera' && target.kind === 'target') target.targetPc = nextPoint;
    rebuild();
  }

  function patchWidget(type, id, patch) {
    const target = findMutableWidget(journey, type, id);
    if (!target || !patch || typeof patch !== 'object') return;
    const source = /** @type {Record<string, unknown>} */ (patch);
    if (type === 'camera') {
      const index = journey.cameraLookWaypoints.findIndex((entry) => entry.id === id);
      if (index < 0) return;
      const frameAtKey = evaluator.evaluate(target.timeSecs ?? state.timeSecs);
      const nextWaypoints = [...journey.cameraLookWaypoints];
      nextWaypoints[index] = patchCameraWaypoint(target, source, frameAtKey);
      journey = { ...journey, cameraLookWaypoints: sortByTime(nextWaypoints) };
      rebuild();
      return;
    }
    for (const [key, value] of Object.entries(source)) {
      if (key === 'positionPc' || key === 'targetPc' || key === 'forward' || key === 'up') {
        target[key] = clonePoint(value);
      } else if (key === 'orientation') {
        target[key] = cloneQuaternion(value);
      } else {
        target[key] = value;
      }
    }
    rebuild();
  }

  function deleteWidget(type, id) {
    if (type === 'location') {
      journey = { ...journey, locationWaypoints: journey.locationWaypoints.filter((entry) => entry.id !== id) };
    } else if (type === 'camera') {
      journey = { ...journey, cameraLookWaypoints: journey.cameraLookWaypoints.filter((entry) => entry.id !== id) };
    } else if (type === 'guide') {
      journey = { ...journey, guides: journey.guides.filter((entry) => entry.id !== id) };
    } else {
      return;
    }
    if (state.selectedWidget?.type === type && state.selectedWidget.id === id) state.selectedWidget = null;
    state.selectedLocationRange = null;
    rebuild();
  }

  function assertActive() {
    if (disposed) throw new Error('JourneyVideoEditor has been disposed.');
  }
}

/**
 * @param {Element} host
 * @param {ReturnType<typeof createEditorModel>} model
 * @param {import('./editor.d.ts').CreateJourneyVideoEditorOptions} options
 */
function mountEditor(host, model, options) {
  const doc = host.ownerDocument ?? globalThis.document;
  if (!doc) return null;
  host.classList.add('fis-journey-video-editor-host');
  host.innerHTML = editorMarkup();
  const refs = queryRefs(host);
  /** @type {Map<string, unknown>} */
  const viewStates = new Map();
  const viewContextBase = {
    doc,
    preview: options.preview ?? {},
    world: model.world,
    services: {
      hasStorage: Boolean(options.storage),
    },
    dispatch(action) {
      handleViewAction(action);
    },
    reportError,
  };
  /** @type {number | null} */
  let raf = null;
  let lastTick = performance.now();
  let statusMessage = '';
  let rendering = false;

  renderAll();

  return {
    renderAll,
    startLoop,
    async dispose() {
      if (raf != null) cancelAnimationFrame(raf);
      for (const state of viewStates.values()) await state?.dispose?.();
      host.replaceChildren();
      host.classList.remove('fis-journey-video-editor-host');
    },
  };

  function renderAll() {
    renderViews();
  }

  function renderViews() {
    if (rendering) return;
    rendering = true;
    try {
      const snapshot = model.getViewSnapshot({
        statusMessage,
        hasStorage: Boolean(options.storage),
      });
      for (const slot of refs.viewSlots) {
        let view = viewStates.get(slot.key);
        if (!view || view.mode !== slot.mode) {
          disposeView(view);
          slot.body.replaceChildren();
          view = createJourneyVideoEditorView(slot.mode, { index: slot.index });
          viewStates.set(slot.key, view);
          mountView(view, slot.body);
        }
        view.update?.(snapshot);
      }
    } finally {
      rendering = false;
    }
  }

  function mountView(view, body) {
    try {
      Promise.resolve(view.mount({ ...viewContextBase, body })).catch(reportError);
    } catch (error) {
      reportError(error);
    }
  }

  function disposeView(view) {
    try {
      Promise.resolve(view?.dispose?.()).catch(reportError);
    } catch (error) {
      reportError(error);
    }
  }

  async function handleViewAction(action) {
    try {
      const didChange = await applyViewAction(action);
      if (didChange !== false) renderAll();
    } catch (error) {
      reportError(error);
    }
  }

  async function applyViewAction(action) {
    if (!action || typeof action !== 'object') return false;
    if (action.type === 'selectWidget') {
      model.selectWidget(String(action.widgetType), String(action.id), {
        extendRange: action.extendRange === true,
        keepRange: action.keepRange === true,
      });
      return true;
    }
    if (action.type === 'setTileMode') {
      model.setTileMode(Number(action.index), String(action.mode));
      return true;
    }
    if (action.type === 'setDuration') {
      model.setDuration(Number(action.durationSecs));
      return true;
    }
    if (action.type === 'setUnitsPerParsec') {
      model.setUnitsPerParsec(Number(action.unitsPerParsec));
      return true;
    }
    if (action.type === 'setEaseSecs') {
      model.setEaseSecs(Number(action.easeSecs));
      return true;
    }
    if (action.type === 'setTime') {
      model.setTime(Number(action.timeSecs));
      return true;
    }
    if (action.type === 'togglePlaying') {
      if (model.state.playing) model.pause();
      else {
        model.play();
        startLoop();
      }
      return true;
    }
    if (action.type === 'addWidget') {
      if (action.widgetType === 'location') model.addLocation();
      if (action.widgetType === 'camera') model.addCamera();
      if (action.widgetType === 'guide') model.addGuide();
      return true;
    }
    if (action.type === 'deleteWidget') {
      model.deleteWidget(String(action.widgetType), String(action.id));
      return true;
    }
    if (action.type === 'updateWidgetTime') {
      model.updateWidgetTime(String(action.widgetType), String(action.id), Number(action.timeSecs));
      return true;
    }
    if (action.type === 'patchWidget') {
      if (!action.patch || typeof action.patch !== 'object') return false;
      model.patchWidget(String(action.widgetType), String(action.id), action.patch);
      return true;
    }
    if (action.type === 'updateWidgetPoint') {
      if (!action.pointPc || typeof action.pointPc !== 'object') return false;
      model.updateWidgetPoint(String(action.widgetType), String(action.id), action.pointPc);
      return true;
    }
    if (action.type === 'selectLocationGroup') {
      model.selectLocationGroup(action.groupId, action.phase);
      return true;
    }
    if (action.type === 'equalizeLocationRange') {
      model.equalizeLocationRange(String(action.anchorId), String(action.focusId));
      return true;
    }
    if (action.type === 'easeLocationRange') {
      model.easeLocationRange(String(action.anchorId), String(action.focusId));
      return true;
    }
    if (action.type === 'rebuildEaseGroup') {
      model.rebuildEaseGroup(String(action.groupId), action.phase);
      return true;
    }
    if (action.type === 'deleteEaseHelpers') {
      model.deleteEaseHelpers(String(action.groupId), action.phase);
      return true;
    }
    if (action.type === 'loadDocumentFile') {
      model.loadDocument(String(action.text ?? ''));
      statusMessage = action.filename
        ? `Loaded ${action.filename}.`
        : 'Loaded editor document.';
      return true;
    }
    if (action.type === 'saveDocumentFile') {
      const result = await saveTextFile(doc, `${model.journey.id || 'journey'}-editor.json`, model.exportDocument());
      if (result === 'cancelled') {
        statusMessage = 'Save cancelled.';
      } else {
        statusMessage = result === 'saved'
          ? 'Saved editor document.'
          : 'Saved editor document through browser download.';
      }
      return true;
    }
    if (action.type === 'clearStatus') {
      statusMessage = '';
      return true;
    }
    return false;
  }

  function startLoop() {
    if (raf != null) return;
    lastTick = performance.now();
    const tick = (now) => {
      raf = null;
      const delta = Math.min(0.1, (now - lastTick) / 1000);
      lastTick = now;
      if (model.state.playing) {
        model.tick(delta);
        renderAll();
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
  }

  function reportError(error) {
    options.onError?.(error);
    statusMessage = error instanceof Error ? error.message : String(error);
    if (!rendering) renderAll();
  }
}

function editorMarkup() {
  return `
    <div class="jve-shell">
      <aside class="jve-sidebar">
        <section class="jve-view jve-state-summary" data-view-slot="state-summary"></section>
        <section class="jve-view jve-duration-view" data-view-slot="duration"></section>
        <section class="jve-view jve-storage-view" data-view-slot="storage"></section>
        <section class="jve-view jve-guide-flow-view" data-view-slot="guide-flow"></section>
        <section class="jve-view jve-waypoint-editor" data-view-slot="waypoint-editor"></section>
        <section class="jve-status" data-view-slot="status"></section>
      </aside>
      <main class="jve-main">
        <div class="jve-view-toolbar" data-view-slot="scale"></div>
        <section class="jve-tile-grid">
          ${[0, 1, 2, 3].map((index) => `
            <div class="jve-tile" data-view-slot="tile" data-view-index="${index}"></div>
          `).join('')}
        </section>
        <section class="jve-bottom-panel">
          <div class="jve-transport" data-view-slot="transport"></div>
          <div class="jve-timeline" data-view-slot="timeline"></div>
        </section>
      </main>
    </div>
  `;
}

/** @param {Element} host */
function queryRefs(host) {
  return {
    viewSlots: [...host.querySelectorAll('[data-view-slot]')].map((body, index) => ({
      body,
      key: `${body.getAttribute('data-view-slot')}:${body.getAttribute('data-view-index') ?? index}`,
      mode: String(body.getAttribute('data-view-slot') ?? ''),
      index: body.hasAttribute('data-view-index') ? Number(body.getAttribute('data-view-index')) : null,
    })),
  };
}

function createEditorViewSnapshot(journey, state, evaluator, evaluated, samples, world, ui = {}) {
  const snapshotJourney = normalizeTimedJourney(journey);
  const snapshotSamples = samples.map(cloneFrame);
  return deepFreeze({
    journey: snapshotJourney,
    editorState: normalizeJourneyVideoEditorState(state),
    evaluated: cloneFrame(evaluated),
    samples: snapshotSamples,
    cameraMarkers: createCameraWaypointMarkers(snapshotJourney, evaluator),
    projectionData: {
      bounds: computeJourneyBounds(snapshotJourney, snapshotSamples),
    },
    world,
    ui: {
      statusMessage: String(ui.statusMessage ?? ''),
      hasStorage: ui.hasStorage === true,
    },
  });
}

function cloneFrame(frame) {
  return {
    ...frame,
    observerPc: clonePoint(frame.observerPc),
    targetPc: clonePoint(frame.targetPc),
    cameraForwardPc: clonePoint(frame.cameraForwardPc),
    velocityPcPerSec: clonePoint(frame.velocityPcPerSec),
    velocityUnitVectorPc: clonePoint(frame.velocityUnitVectorPc),
    cameraUpPc: clonePoint(frame.cameraUpPc),
    orientationIcrs: frame.orientationIcrs ? { ...frame.orientationIcrs } : null,
    cameraQuaternion: frame.cameraQuaternion ? { ...frame.cameraQuaternion } : null,
  };
}

function clonePoint(point) {
  return {
    x: Number(point?.x ?? 0),
    y: Number(point?.y ?? 0),
    z: Number(point?.z ?? 0),
  };
}

function cloneQuaternion(quaternion) {
  return {
    x: Number(quaternion?.x ?? 0),
    y: Number(quaternion?.y ?? 0),
    z: Number(quaternion?.z ?? 0),
    w: Number(quaternion?.w ?? 1),
  };
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function findWidget(journey, type, id) {
  return findMutableWidget(journey, type, id) ? { type, id } : null;
}

function findMutableWidget(journey, type, id) {
  if (type === 'location') return journey.locationWaypoints.find((entry) => entry.id === id) ?? null;
  if (type === 'camera') return journey.cameraLookWaypoints.find((entry) => entry.id === id) ?? null;
  if (type === 'guide') return journey.guides.find((entry) => entry.id === id) ?? null;
  return null;
}

function sortByTime(entries) {
  return [...entries].sort((left, right) => Number(left.timeSecs ?? 0) - Number(right.timeSecs ?? 0) || String(left.id).localeCompare(String(right.id)));
}

function nextId(entries, prefix) {
  const ids = new Set(entries.map((entry) => entry.id));
  let index = entries.length + 1;
  while (ids.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function snapTime(value) {
  return Math.round((Number(value) || 0) / TIMELINE_STEP_SECS) * TIMELINE_STEP_SECS;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
}

function downloadText(doc, filename, text) {
  const blob = new Blob([`${text.trim()}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function saveTextFile(doc, filename, text) {
  const data = `${text.trim()}\n`;
  const picker = doc.defaultView?.showSaveFilePicker;
  if (typeof picker === 'function') {
    try {
      const handle = await picker.call(doc.defaultView, {
        suggestedName: filename,
        types: [
          {
            description: 'JSON files',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob([data], { type: 'application/json' }));
      await writable.close();
      return 'saved';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }
  downloadText(doc, filename, data);
  return 'downloaded';
}
