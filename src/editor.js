// @ts-nocheck

import {
  createTimedJourneyEvaluator,
  deleteJourneyEaseLocationGroupHelpers,
  easeJourneyLocationRangeStartEnd,
  equalizeJourneyLocationRangeSpeeds,
  getJourneyLocationRangeSpeedStats,
  normalizeTimedJourney,
  rebuildJourneyEaseLocationGroup,
} from '@found-in-space/journey';

import {
  createJourneyVideoEditorDocument,
  exportJourneyVideoEditorDocument,
  importJourneyVideoEditorDocument,
  normalizeJourneyVideoEditorState,
} from './index.js';
import { createJourneyVideoWorld } from './world.js';
import { createJourneyVideoEditorView } from './editor/views.js';
import {
  computeJourneyBounds,
} from './editor/projection.js';

const SAMPLE_STEP_SECS = 0.5;
const TIMELINE_STEP_SECS = 0.05;
const TILE_MODES = ['xy', 'xz', 'yz', 'perspective', 'skykit'];
const TILE_LABELS = new Map([
  ['xy', 'XY'],
  ['xz', 'XZ'],
  ['yz', 'YZ'],
  ['perspective', 'Perspective'],
  ['skykit', 'SkyKit'],
]);

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
    setZoom(zoom) {
      model.setZoom(zoom);
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

  function rebuild() {
    evaluator = createTimedJourneyEvaluator(journey);
    samples = evaluator.sample({ stepSecs: SAMPLE_STEP_SECS });
    state.timeSecs = clamp(state.timeSecs, 0, journey.durationSecs);
    evaluated = evaluator.evaluate(state.timeSecs);
    persist();
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
    setZoom(zoom) {
      assertActive();
      state.zoom = clamp(Number(zoom), 0.35, 50);
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
      const frame = evaluated;
      const waypoint = {
        id: nextId(journey.cameraLookWaypoints, 'cam'),
        timeSecs: state.timeSecs,
        kind: 'target',
        targetPc: { ...frame.targetPc },
        up: { ...frame.cameraUpPc },
      };
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
      if (selected.type === 'location') {
        journey = { ...journey, locationWaypoints: journey.locationWaypoints.filter((entry) => entry.id !== selected.id) };
      } else if (selected.type === 'camera') {
        journey = { ...journey, cameraLookWaypoints: journey.cameraLookWaypoints.filter((entry) => entry.id !== selected.id) };
      } else {
        journey = { ...journey, guides: journey.guides.filter((entry) => entry.id !== selected.id) };
      }
      state.selectedWidget = null;
      state.selectedLocationRange = null;
      rebuild();
    },
    applyJourney(nextJourney) {
      journey = normalizeTimedJourney(nextJourney);
      rebuild();
    },
    exportDocument() {
      return exportJourneyVideoEditorDocument(document);
    },
    getViewSnapshot() {
      return createEditorViewSnapshot(journey, state, evaluated, samples, world);
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
  /** @type {Map<number, unknown>} */
  const tileStates = new Map();
  const viewContextBase = {
    doc,
    preview: options.preview ?? {},
    world: model.world,
    dispatch(action) {
      handleViewAction(action);
    },
    reportError,
  };
  /** @type {number | null} */
  let raf = null;
  let lastTick = performance.now();

  refs.play.addEventListener('click', () => {
    if (model.state.playing) model.pause();
    else model.play();
    startLoop();
    renderAll();
  });
  refs.time.addEventListener('input', () => {
    model.setTime(Number(refs.time.value));
    renderAll();
  });
  refs.duration.addEventListener('change', () => {
    model.applyJourney({ ...model.journey, durationSecs: Math.max(0.1, Number(refs.duration.value) || model.journey.durationSecs) });
    renderAll();
  });
  refs.zoom.addEventListener('input', () => {
    model.setZoom(Number(refs.zoom.value));
    renderAll();
  });
  refs.exportJson.addEventListener('click', () => {
    refs.json.value = JSON.stringify(model.getJourney(), null, 2);
  });
  refs.importJson.addEventListener('click', () => {
    try {
      model.setJourney(JSON.parse(refs.json.value));
      renderAll();
    } catch (error) {
      reportError(error);
    }
  });
  refs.downloadJson.addEventListener('click', () => downloadText(doc, `${model.journey.id || 'journey'}.json`, refs.json.value));
  refs.addLocation.addEventListener('click', () => { model.addLocation(); renderAll(); });
  refs.addCamera.addEventListener('click', () => { model.addCamera(); renderAll(); });
  refs.addGuide.addEventListener('click', () => { model.addGuide(); renderAll(); });

  for (const [index, tile] of refs.tiles.entries()) {
    tile.select.addEventListener('change', () => {
      model.setTileMode(index, tile.select.value);
      renderAll();
    });
  }

  renderAll();

  return {
    renderAll,
    startLoop,
    async dispose() {
      if (raf != null) cancelAnimationFrame(raf);
      for (const state of tileStates.values()) await state?.dispose?.();
      host.replaceChildren();
      host.classList.remove('fis-journey-video-editor-host');
    },
  };

  function renderAll() {
    renderSidebar();
    renderTimeline();
    renderInspector();
    renderTiles();
  }

  function renderSidebar() {
    refs.time.max = String(model.journey.durationSecs);
    refs.time.value = String(model.state.timeSecs);
    refs.timeLabel.textContent = `${model.state.timeSecs.toFixed(2)}s`;
    refs.duration.value = String(model.journey.durationSecs);
    refs.zoom.value = String(model.state.zoom);
    refs.zoomLabel.textContent = `${Math.round(model.state.zoom * 100)}%`;
    refs.play.textContent = model.state.playing ? 'Pause' : 'Play';
    refs.json.value = JSON.stringify(model.getJourney(), null, 2);
    refs.stats.time.textContent = `${model.state.timeSecs.toFixed(2)}s`;
    refs.stats.position.textContent = pointText(model.evaluated.observerPc);
    refs.stats.speed.textContent = `${model.evaluated.speedPcPerSec.toFixed(2)} pc/s`;
    refs.stats.velocity.textContent = pointText(model.evaluated.velocityPcPerSec);
    refs.stats.camera.textContent = pointText(model.evaluated.targetPc);
    refs.guideList.replaceChildren(...model.journey.guides.map((guide) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'jve-guide-chip';
      button.textContent = guide.label ?? guide.id;
      button.addEventListener('click', () => {
        model.selectWidget('guide', guide.id);
        renderAll();
      });
      return button;
    }));
  }

  function renderTimeline() {
    refs.locationLane.replaceChildren(...model.journey.locationWaypoints.map((waypoint, index) => createTimelineWidget('location', waypoint, String(index + 1))));
    refs.cameraLane.replaceChildren(...model.journey.cameraLookWaypoints.map((waypoint, index) => createTimelineWidget('camera', waypoint, String(index + 1))));
    refs.playhead.style.left = `${(model.state.timeSecs / Math.max(0.1, model.journey.durationSecs)) * 100}%`;
  }

  function createTimelineWidget(type, waypoint, label) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'jve-timeline-widget';
    button.dataset.widgetType = type;
    const group = waypoint.motionGroup;
    if (group?.role) button.dataset.motionRole = String(group.role);
    if (model.state.selectedWidget?.type === type && model.state.selectedWidget.id === waypoint.id) button.classList.add('is-selected');
    button.style.left = `${(waypoint.timeSecs / Math.max(0.1, model.journey.durationSecs)) * 100}%`;
    button.textContent = label;
    button.addEventListener('click', (event) => {
      model.selectWidget(type, waypoint.id, { extendRange: event.shiftKey });
      renderAll();
    });
    button.addEventListener('pointerdown', (event) => beginTimelineDrag(event, waypoint, button));
    return button;
  }

  function beginTimelineDrag(event, waypoint, button) {
    event.preventDefault();
    const track = button.parentElement;
    const rect = track.getBoundingClientRect();
    const move = (moveEvent) => {
      const percent = clamp((moveEvent.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      waypoint.timeSecs = snapTime(percent * model.journey.durationSecs);
      model.applyJourney(model.journey);
      renderAll();
    };
    const done = () => {
      globalThis.removeEventListener('pointermove', move);
      globalThis.removeEventListener('pointerup', done);
    };
    globalThis.addEventListener('pointermove', move);
    globalThis.addEventListener('pointerup', done, { once: true });
  }

  function renderInspector() {
    refs.inspector.replaceChildren();
    const selected = model.state.selectedWidget;
    const range = selectedLocationRangeInfo();
    if (range) {
      refs.inspector.append(renderRangeInspector(range));
      return;
    }
    if (!selected) {
      refs.inspector.append(paragraph('Select a timeline widget or path marker.'));
      return;
    }
    const widget = findMutableWidget(model.journey, selected.type, selected.id);
    if (!widget) {
      refs.inspector.append(paragraph('Selected widget no longer exists.'));
      return;
    }
    refs.inspector.append(renderWidgetInspector(selected, widget));
  }

  function renderRangeInspector(range) {
    const section = panel('Location range');
    const stats = getJourneyLocationRangeSpeedStats(model.journey.locationWaypoints, range.anchorId, range.focusId);
    section.append(keyValueGrid([
      ['from', range.anchorId],
      ['to', range.focusId],
      ['waypoints', String(stats?.waypointCount ?? 0)],
      ['distance', `${(stats?.totalLengthPc ?? 0).toFixed(2)} pc`],
      ['avg speed', `${(stats?.averageSpeedPcPerSec ?? 0).toFixed(2)} pc/s`],
    ]));
    const row = doc.createElement('div');
    row.className = 'jve-button-row';
    const equalize = button('Equalize speed', () => {
      const result = equalizeJourneyLocationRangeSpeeds(model.journey.locationWaypoints, range.anchorId, range.focusId);
      model.applyJourney({ ...model.journey, locationWaypoints: result.locationWaypoints });
      renderAll();
    });
    const ease = button('Ease start/end', () => {
      const result = easeJourneyLocationRangeStartEnd(model.journey.locationWaypoints, range.anchorId, range.focusId);
      model.applyJourney({ ...model.journey, locationWaypoints: result.locationWaypoints });
      renderAll();
    });
    row.append(equalize, ease);
    section.append(row);
    return section;
  }

  function renderWidgetInspector(selected, widget) {
    const section = panel(`${selected.type} ${widget.id}`);
    section.append(field('Time', numberInput(widget.timeSecs ?? model.state.timeSecs, (value) => {
      widget.timeSecs = snapTime(value);
      model.applyJourney(model.journey);
      renderAll();
    })));
    if (selected.type === 'camera') {
      if (widget.kind !== 'target') {
        widget.kind = 'target';
        widget.targetPc = { ...model.evaluated.targetPc };
      }
      section.append(vectorEditor('Target', widget.targetPc, (point) => {
        widget.targetPc = point;
        model.applyJourney(model.journey);
        renderAll();
      }));
    } else {
      const point = selected.type === 'guide' ? widget.positionPc : widget.positionPc;
      section.append(vectorEditor('Position', point, (nextPoint) => {
        widget.positionPc = nextPoint;
        model.applyJourney(model.journey);
        renderAll();
      }));
    }
    if (selected.type === 'guide') {
      section.append(field('Label', textInput(widget.label, (value) => {
        widget.label = value;
        model.applyJourney(model.journey);
        renderAll();
      })));
      section.append(field('Color', colorInput(widget.color ?? '#8fd5ff', (value) => {
        widget.color = value;
        model.applyJourney(model.journey);
        renderAll();
      })));
    }
    if (selected.type === 'location' && widget.motionGroup?.id) {
      const row = doc.createElement('div');
      row.className = 'jve-button-row';
      row.append(
        button('Select ease group', () => {
          model.state.selectedLocationGroupId = widget.motionGroup.id;
          model.state.selectedLocationGroupPhase = widget.motionGroup.phase === 'start' || widget.motionGroup.phase === 'end' ? widget.motionGroup.phase : null;
          renderAll();
        }),
        button('Rebuild ease', () => {
          const result = rebuildJourneyEaseLocationGroup(model.journey.locationWaypoints, widget.motionGroup.id, { phase: widget.motionGroup.phase });
          model.applyJourney({ ...model.journey, locationWaypoints: result.locationWaypoints });
          renderAll();
        }),
        button('Delete ease helpers', () => {
          const result = deleteJourneyEaseLocationGroupHelpers(model.journey.locationWaypoints, widget.motionGroup.id, { phase: widget.motionGroup.phase });
          model.applyJourney({ ...model.journey, locationWaypoints: result.locationWaypoints });
          renderAll();
        }),
      );
      section.append(row);
    }
    section.append(button('Delete', () => { model.deleteSelected(); renderAll(); }, 'is-danger'));
    return section;
  }

  function renderTiles() {
    const snapshot = model.getViewSnapshot();
    for (const [index, tile] of refs.tiles.entries()) {
      const mode = model.state.tileModes[index] ?? 'xy';
      tile.select.value = mode;
      for (const entry of TILE_MODES) {
        if (![...tile.select.options].some((option) => option.value === entry)) {
          const option = doc.createElement('option');
          option.value = entry;
          option.textContent = TILE_LABELS.get(entry) ?? entry;
          tile.select.append(option);
        }
      }
      const current = tileStates.get(index);
      if (current?.mode !== mode) {
        disposeTileView(current);
        tile.body.replaceChildren();
        tileStates.delete(index);
        const view = createJourneyVideoEditorView(mode);
        tileStates.set(index, view);
        mountTileView(view, tile.body);
      }
      tileStates.get(index)?.update?.(snapshot);
    }
  }

  function mountTileView(view, body) {
    try {
      Promise.resolve(view.mount({ ...viewContextBase, body })).catch(reportError);
    } catch (error) {
      reportError(error);
    }
  }

  function disposeTileView(view) {
    try {
      Promise.resolve(view?.dispose?.()).catch(reportError);
    } catch (error) {
      reportError(error);
    }
  }

  function handleViewAction(action) {
    if (action.type === 'selectWidget') {
      model.selectWidget(String(action.widgetType), String(action.id), {
        extendRange: action.extendRange === true,
        keepRange: action.keepRange === true,
      });
      renderAll();
      return;
    }
    if (action.type === 'updateWidgetPoint') {
      if (!action.pointPc || typeof action.pointPc !== 'object') return;
      model.updateWidgetPoint(String(action.widgetType), String(action.id), action.pointPc);
      renderAll();
    }
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

  function selectedLocationRangeInfo() {
    const range = model.state.selectedLocationRange;
    if (!range) return null;
    const ids = new Set(model.journey.locationWaypoints.map((waypoint) => waypoint.id));
    return ids.has(range.anchorId) && ids.has(range.focusId) ? range : null;
  }

  function reportError(error) {
    options.onError?.(error);
    refs.status.textContent = error instanceof Error ? error.message : String(error);
  }

  function field(label, input) {
    const wrapper = doc.createElement('label');
    wrapper.append(span(label), input);
    return wrapper;
  }

  function vectorEditor(label, point, onChange) {
    const grid = doc.createElement('div');
    grid.className = 'jve-vector-grid';
    grid.append(span(label));
    for (const axis of ['x', 'y', 'z']) {
      grid.append(numberInput(point?.[axis] ?? 0, (value) => {
        onChange({ ...point, [axis]: value });
      }));
    }
    return grid;
  }

  function numberInput(value, onChange) {
    const input = doc.createElement('input');
    input.type = 'number';
    input.step = '0.05';
    input.value = formatNumber(value);
    input.addEventListener('change', () => onChange(Number(input.value)));
    return input;
  }

  function textInput(value, onChange) {
    const input = doc.createElement('input');
    input.value = String(value ?? '');
    input.addEventListener('change', () => onChange(input.value));
    return input;
  }

  function colorInput(value, onChange) {
    const input = doc.createElement('input');
    input.type = 'color';
    input.value = /^#[0-9a-f]{6}$/iu.test(String(value)) ? String(value) : '#8fd5ff';
    input.addEventListener('input', () => onChange(input.value));
    return input;
  }

  function button(label, onClick, className = '') {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (className) button.className = className;
    button.addEventListener('click', onClick);
    return button;
  }

  function panel(title) {
    const section = doc.createElement('section');
    const heading = doc.createElement('h2');
    heading.textContent = title;
    section.append(heading);
    return section;
  }

  function paragraph(text) {
    const p = doc.createElement('p');
    p.textContent = text;
    return p;
  }

  function span(text) {
    const value = doc.createElement('span');
    value.textContent = text;
    return value;
  }

  function keyValueGrid(rows) {
    const grid = doc.createElement('dl');
    grid.className = 'jve-key-value-grid';
    for (const [key, value] of rows) {
      const dt = doc.createElement('dt');
      const dd = doc.createElement('dd');
      dt.textContent = key;
      dd.textContent = value;
      grid.append(dt, dd);
    }
    return grid;
  }
}

function editorMarkup() {
  return `
    <div class="jve-shell">
      <aside class="jve-sidebar">
        <h1>Journey Video Editor</h1>
        <dl class="jve-stats">
          <dt>Time</dt><dd data-stat="time">0.00s</dd>
          <dt>Position</dt><dd data-stat="position">-</dd>
          <dt>Speed</dt><dd data-stat="speed">-</dd>
          <dt>Velocity</dt><dd data-stat="velocity">-</dd>
          <dt>Camera</dt><dd data-stat="camera">-</dd>
        </dl>
        <label>Duration <input data-duration type="number" min="0.1" step="0.1"></label>
        <div class="jve-button-row">
          <button data-export-json type="button">Export JSON</button>
          <button data-import-json type="button">Import JSON</button>
          <button data-download-json type="button">Download</button>
        </div>
        <textarea data-json spellcheck="false"></textarea>
        <div class="jve-button-row">
          <button data-add-location type="button">Add Location</button>
          <button data-add-camera type="button">Add Camera</button>
          <button data-add-guide type="button">Add Guide</button>
        </div>
        <div data-guide-list class="jve-guide-list"></div>
        <section data-inspector class="jve-inspector"></section>
        <p data-status class="jve-status"></p>
      </aside>
      <main class="jve-main">
        <div class="jve-view-toolbar">
          <label>Zoom <input data-zoom type="range" min="0.35" max="50" step="0.05"><span data-zoom-label>100%</span></label>
        </div>
        <section class="jve-tile-grid">
          ${[0, 1, 2, 3].map((index) => `
            <div class="jve-tile" data-tile="${index}">
              <div class="jve-tile-toolbar"><select data-tile-mode></select></div>
              <div class="jve-tile-body" data-tile-body></div>
            </div>
          `).join('')}
        </section>
        <section class="jve-bottom-panel">
          <div class="jve-transport"><button data-play type="button">Play</button><span data-time-label>0.00s</span></div>
          <div class="jve-timeline">
            <div data-playhead class="jve-playhead"></div>
            <div class="jve-lane"><span>Time</span><div class="jve-lane-track"><input data-time type="range" min="0" step="0.05"></div></div>
            <div class="jve-lane"><span>Loc</span><div class="jve-lane-track" data-lane-track="location"></div></div>
            <div class="jve-lane"><span>Cam</span><div class="jve-lane-track" data-lane-track="camera"></div></div>
          </div>
        </section>
      </main>
    </div>
  `;
}

/** @param {Element} host */
function queryRefs(host) {
  return {
    play: must(host, '[data-play]'),
    time: must(host, '[data-time]'),
    timeLabel: must(host, '[data-time-label]'),
    duration: must(host, '[data-duration]'),
    zoom: must(host, '[data-zoom]'),
    zoomLabel: must(host, '[data-zoom-label]'),
    exportJson: must(host, '[data-export-json]'),
    importJson: must(host, '[data-import-json]'),
    downloadJson: must(host, '[data-download-json]'),
    json: must(host, '[data-json]'),
    addLocation: must(host, '[data-add-location]'),
    addCamera: must(host, '[data-add-camera]'),
    addGuide: must(host, '[data-add-guide]'),
    guideList: must(host, '[data-guide-list]'),
    inspector: must(host, '[data-inspector]'),
    status: must(host, '[data-status]'),
    playhead: must(host, '[data-playhead]'),
    locationLane: must(host, '[data-lane-track="location"]'),
    cameraLane: must(host, '[data-lane-track="camera"]'),
    stats: {
      time: must(host, '[data-stat="time"]'),
      position: must(host, '[data-stat="position"]'),
      speed: must(host, '[data-stat="speed"]'),
      velocity: must(host, '[data-stat="velocity"]'),
      camera: must(host, '[data-stat="camera"]'),
    },
    tiles: [...host.querySelectorAll('[data-tile]')].map((tile) => ({
      el: tile,
      select: must(tile, '[data-tile-mode]'),
      body: must(tile, '[data-tile-body]'),
    })),
  };
}

function must(root, selector) {
  const value = root.querySelector(selector);
  if (!value) throw new Error(`Journey video editor markup missing ${selector}.`);
  return value;
}

function createEditorViewSnapshot(journey, state, evaluated, samples, world) {
  const snapshotJourney = normalizeTimedJourney(journey);
  const snapshotSamples = samples.map(cloneFrame);
  return deepFreeze({
    journey: snapshotJourney,
    editorState: normalizeJourneyVideoEditorState(state),
    evaluated: cloneFrame(evaluated),
    samples: snapshotSamples,
    projectionData: {
      bounds: computeJourneyBounds(snapshotJourney, snapshotSamples),
    },
    world,
  });
}

function cloneFrame(frame) {
  return {
    ...frame,
    observerPc: clonePoint(frame.observerPc),
    targetPc: clonePoint(frame.targetPc),
    velocityPcPerSec: clonePoint(frame.velocityPcPerSec),
    cameraUpPc: clonePoint(frame.cameraUpPc),
    orientationIcrs: frame.orientationIcrs ? { ...frame.orientationIcrs } : null,
  };
}

function clonePoint(point) {
  return {
    x: Number(point?.x ?? 0),
    y: Number(point?.y ?? 0),
    z: Number(point?.z ?? 0),
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

function pointText(point) {
  return `${formatNumber(point?.x)} ${formatNumber(point?.y)} ${formatNumber(point?.z)}`;
}

function formatNumber(value) {
  return Number(value ?? 0).toFixed(3).replace(/\.?0+$/u, '');
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
