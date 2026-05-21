// @ts-nocheck
import { Camera, MapPin, Plus } from 'lucide';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  createObject3dPlugin,
  createSkykitAnimationLoop,
  createSkykitViewer,
  createStreamingStarsPlugin,
} from '@found-in-space/skykit';
import {
  OCTREE_DEFAULT,
  createStarOctreeProviderService,
} from '@found-in-space/star-octree-provider';
import { createObserverShellStrategy } from '@found-in-space/star-trees';
import { createThreeStarField } from '@found-in-space/three-star-field';
import { JOURNEY_VIDEO_EDITOR_TILE_MODES } from '../index.js';

import {
  createJourneyProjectionTransform,
  hitJourneyEditorMarker,
  projectJourneyEditorPoint,
} from './projection.js';
import {
  createJourneyVideoGuideGroup,
  createJourneyVideoWorld,
  disposeObjectChildren,
  pointPcToRenderUnits,
  scalarPcToRenderUnits,
  syncJourneyVideoGuideGroup,
} from '../world.js';

/**
 * @typedef {{
 *   mode: string;
 *   mount(context: JourneyVideoEditorViewContext): void | Promise<void>;
 *   update(snapshot: JourneyVideoEditorViewSnapshot): void;
 *   resize(size?: { width?: number; height?: number; devicePixelRatio?: number }): void;
 *   dispose(): void | Promise<void>;
 * }} JourneyVideoEditorView
 *
 * @typedef {{
 *   doc: Document;
 *   body: Element;
 *   preview?: Record<string, unknown>;
 *   world?: ReturnType<typeof createJourneyVideoWorld>;
 *   services?: Record<string, unknown>;
 *   dispatch(action: Record<string, unknown>): void;
 *   reportError(error: unknown): void;
 * }} JourneyVideoEditorViewContext
 *
 * @typedef {{
 *   journey: Record<string, unknown>;
 *   editorState: Record<string, unknown>;
 *   evaluated: Record<string, unknown>;
 *   samples: Array<Record<string, unknown>>;
 *   projectionData: Record<string, unknown>;
 *   world: ReturnType<typeof createJourneyVideoWorld>;
 *   ui?: Record<string, unknown>;
 * }} JourneyVideoEditorViewSnapshot
 */

/** @param {string} mode */
export function createJourneyVideoEditorView(mode, options = {}) {
  if (mode === 'state-summary') return createStateSummaryView();
  if (mode === 'duration') return createDurationView();
  if (mode === 'storage') return createStorageView();
  if (mode === 'guide-flow') return createGuideFlowView();
  if (mode === 'waypoint-editor') return createWaypointEditorView();
  if (mode === 'status') return createStatusView();
  if (mode === 'zoom') return createZoomView();
  if (mode === 'transport') return createTransportView();
  if (mode === 'timeline') return createTimelineView();
  if (mode === 'tile') return createTileSlotView(Number(options.index ?? 0));
  if (mode === 'perspective') return createPerspectiveView();
  if (mode === 'skykit') return createSkykitView();
  return createProjectionView(mode);
}

function createStateSummaryView() {
  let context = null;
  let stats = null;
  return {
    mode: 'state-summary',
    mount(nextContext) {
      context = nextContext;
      const title = nextContext.doc.createElement('h1');
      title.textContent = 'Journey Video Editor';
      stats = nextContext.doc.createElement('dl');
      stats.className = 'jve-stats';
      nextContext.body.replaceChildren(title, stats);
    },
    update(snapshot) {
      if (!context || !stats) return;
      stats.replaceChildren(...keyValueRows(context.doc, [
        ['Time', `${Number(snapshot.editorState.timeSecs ?? 0).toFixed(2)}s`],
        ['Position', pointText(snapshot.evaluated.observerPc)],
        ['Speed', `${Number(snapshot.evaluated.speedPcPerSec ?? 0).toFixed(2)} pc/s`],
        ['Velocity', pointText(snapshot.evaluated.velocityPcPerSec)],
        ['Camera', pointText(snapshot.evaluated.targetPc)],
      ]));
    },
    resize() {},
    dispose() {
      context?.body.replaceChildren();
      context = null;
      stats = null;
    },
  };
}

function createDurationView() {
  let context = null;
  let input = null;
  return {
    mode: 'duration',
    mount(nextContext) {
      context = nextContext;
      const label = nextContext.doc.createElement('label');
      label.className = 'jve-field';
      label.append(span(nextContext.doc, 'Duration'));
      input = numberInput(nextContext.doc, 0, (value) => {
        nextContext.dispatch({ type: 'setDuration', durationSecs: value });
      }, { min: 0.1, step: 0.1 });
      label.append(input);
      nextContext.body.replaceChildren(label);
    },
    update(snapshot) {
      if (!input || input === input.ownerDocument.activeElement) return;
      input.value = formatNumber(snapshot.journey.durationSecs);
    },
    resize() {},
    dispose() {
      context?.body.replaceChildren();
      context = null;
      input = null;
    },
  };
}

function createStorageView() {
  let context = null;
  let input = null;
  return {
    mode: 'storage',
    mount(nextContext) {
      context = nextContext;
      const heading = panelHeading(nextContext.doc, 'Project');
      const row = nextContext.doc.createElement('div');
      row.className = 'jve-button-row';
      input = nextContext.doc.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.hidden = true;
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          nextContext.dispatch({
            type: 'loadDocumentFile',
            filename: file.name,
            text: await file.text(),
          });
        } catch (error) {
          nextContext.reportError(error);
        } finally {
          input.value = '';
        }
      });
      row.append(
        button(nextContext.doc, 'Load', () => input?.click()),
        button(nextContext.doc, 'Save', () => nextContext.dispatch({ type: 'saveDocumentFile' })),
      );
      nextContext.body.replaceChildren(heading, row, input);
    },
    update() {},
    resize() {},
    dispose() {
      context?.body.replaceChildren();
      context = null;
      input = null;
    },
  };
}

function createGuideFlowView() {
  let context = null;
  return {
    mode: 'guide-flow',
    mount(nextContext) {
      context = nextContext;
    },
    update(snapshot) {
      if (!context) return;
      const doc = context.doc;
      const heading = panelTitleBar(doc, 'Guides', [
        iconButton(doc, Plus, 'Add guide', () => context.dispatch({ type: 'addWidget', widgetType: 'guide' })),
      ]);
      const list = doc.createElement('div');
      list.className = 'jve-widget-flow jve-guide-flow';
      for (const guide of snapshot.journey.guides ?? []) {
        list.append(renderGuideWidget(context, snapshot, guide));
      }
      if ((snapshot.journey.guides ?? []).length === 0) {
        list.append(emptyText(doc, 'No guide volumes yet.'));
      }
      context.body.replaceChildren(heading, list);
    },
    resize() {},
    dispose() {
      context?.body.replaceChildren();
      context = null;
    },
  };
}

function createWaypointEditorView() {
  let context = null;
  return {
    mode: 'waypoint-editor',
    mount(nextContext) {
      context = nextContext;
    },
    update(snapshot) {
      if (!context) return;
      const doc = context.doc;
      const heading = panelTitleBar(doc, 'Waypoints', [
        iconTextButton(doc, MapPin, 'Add', () => context.dispatch({ type: 'addWidget', widgetType: 'location' }), {
          ariaLabel: 'Add location',
          title: 'Add location',
        }),
        iconTextButton(doc, Camera, 'Add', () => context.dispatch({ type: 'addWidget', widgetType: 'camera' }), {
          ariaLabel: 'Add camera',
          title: 'Add camera',
        }),
      ]);
      const selectedRange = selectedLocationRangeInfo(snapshot);
      if (selectedRange) {
        context.body.replaceChildren(heading, renderRangeEditor(context, snapshot, selectedRange));
        return;
      }
      const flow = doc.createElement('div');
      flow.className = 'jve-widget-flow jve-waypoint-flow';
      const entries = waypointEntries(snapshot);
      for (const entry of entries) {
        flow.append(renderWaypointFlowWidget(context, snapshot, entry));
      }
      if (entries.length === 0) flow.append(emptyText(doc, 'No time-based waypoints yet.'));
      context.body.replaceChildren(heading, flow);
    },
    resize() {},
    dispose() {
      context?.body.replaceChildren();
      context = null;
    },
  };
}

function createStatusView() {
  let context = null;
  return {
    mode: 'status',
    mount(nextContext) {
      context = nextContext;
    },
    update(snapshot) {
      if (!context) return;
      const message = String(snapshot.ui?.statusMessage ?? '');
      context.body.textContent = message;
      context.body.toggleAttribute('hidden', !message);
    },
    resize() {},
    dispose() {
      context?.body.replaceChildren();
      context = null;
    },
  };
}

function createZoomView() {
  let context = null;
  let input = null;
  let value = null;
  return {
    mode: 'zoom',
    mount(nextContext) {
      context = nextContext;
      const label = nextContext.doc.createElement('label');
      label.className = 'jve-inline-control';
      label.append(span(nextContext.doc, 'Zoom'));
      input = nextContext.doc.createElement('input');
      input.type = 'range';
      input.min = '0.35';
      input.max = '50';
      input.step = '0.05';
      input.addEventListener('input', () => {
        nextContext.dispatch({ type: 'setZoom', zoom: Number(input.value) });
      });
      value = nextContext.doc.createElement('span');
      label.append(input, value);
      nextContext.body.replaceChildren(label);
    },
    update(snapshot) {
      if (!input || !value) return;
      if (input !== input.ownerDocument.activeElement) input.value = String(snapshot.editorState.zoom ?? 1);
      value.textContent = `${Math.round(Number(snapshot.editorState.zoom ?? 1) * 100)}%`;
    },
    resize() {},
    dispose() {
      context?.body.replaceChildren();
      context = null;
      input = null;
      value = null;
    },
  };
}

function createTransportView() {
  let context = null;
  let play = null;
  let time = null;
  return {
    mode: 'transport',
    mount(nextContext) {
      context = nextContext;
      play = button(nextContext.doc, 'Play', () => nextContext.dispatch({ type: 'togglePlaying' }));
      time = nextContext.doc.createElement('span');
      nextContext.body.replaceChildren(play, time);
    },
    update(snapshot) {
      if (!play || !time) return;
      play.textContent = snapshot.editorState.playing ? 'Pause' : 'Play';
      time.textContent = `${Number(snapshot.editorState.timeSecs ?? 0).toFixed(2)}s`;
    },
    resize() {},
    dispose() {
      context?.body.replaceChildren();
      context = null;
      play = null;
      time = null;
    },
  };
}

function createTimelineView() {
  let context = null;
  let timeInput = null;
  let timeProgress = null;
  let playhead = null;
  let locationLane = null;
  let cameraLane = null;
  let latestSnapshot = null;
  return {
    mode: 'timeline',
    mount(nextContext) {
      context = nextContext;
      playhead = nextContext.doc.createElement('div');
      playhead.className = 'jve-playhead';
      timeInput = nextContext.doc.createElement('input');
      timeInput.type = 'range';
      timeInput.min = '0';
      timeInput.step = '0.05';
      timeInput.addEventListener('input', () => {
        nextContext.dispatch({ type: 'setTime', timeSecs: Number(timeInput.value) });
      });
      const timeLane = timelineLane(nextContext.doc, 'Time');
      timeLane.track.classList.add('jve-time-track');
      timeProgress = nextContext.doc.createElement('div');
      timeProgress.className = 'jve-time-progress';
      timeLane.track.append(timeProgress, timeInput);
      const location = timelineLane(nextContext.doc, 'Loc');
      const camera = timelineLane(nextContext.doc, 'Cam');
      locationLane = location.track;
      cameraLane = camera.track;
      nextContext.body.replaceChildren(playhead, timeLane.el, location.el, camera.el);
    },
    update(snapshot) {
      if (!timeInput || !timeProgress || !playhead || !locationLane || !cameraLane) return;
      latestSnapshot = snapshot;
      const duration = Math.max(0.1, Number(snapshot.journey.durationSecs ?? 0));
      timeInput.max = String(duration);
      if (timeInput !== timeInput.ownerDocument.activeElement) {
        timeInput.value = String(snapshot.editorState.timeSecs ?? 0);
      }
      syncTimelinePlayhead(context, timeInput, timeProgress, playhead, snapshot);
      locationLane.replaceChildren(...(snapshot.journey.locationWaypoints ?? []).map((waypoint, index) => (
        renderTimelineWidget(context, snapshot, {
          type: 'location',
          waypoint,
          label: String(index + 1),
        })
      )));
      cameraLane.replaceChildren(...(snapshot.journey.cameraLookWaypoints ?? []).map((waypoint, index) => (
        renderTimelineWidget(context, snapshot, {
          type: 'camera',
          waypoint,
          label: String(index + 1),
        })
      )));
    },
    resize() {
      if (context && timeInput && timeProgress && playhead && latestSnapshot) {
        syncTimelinePlayhead(context, timeInput, timeProgress, playhead, latestSnapshot);
      }
    },
    dispose() {
      context?.body.replaceChildren();
      context = null;
      timeInput = null;
      timeProgress = null;
      playhead = null;
      locationLane = null;
      cameraLane = null;
      latestSnapshot = null;
    },
  };
}

function syncTimelinePlayhead(context, timeInput, timeProgress, playhead, snapshot) {
  const rootRect = context.body.getBoundingClientRect();
  const track = timeProgress.parentElement ?? timeInput;
  const trackRect = track.getBoundingClientRect();
  const min = Number(timeInput.min || 0);
  const max = Number(timeInput.max || snapshot.journey.durationSecs || 0.1);
  const timeSecs = clamp(Number(snapshot.editorState.timeSecs ?? 0), min, max);
  const percent = max > min ? (timeSecs - min) / (max - min) : 0;
  const progressWidth = track.clientWidth * clamp(percent, 0, 1);
  const left = trackRect.left - rootRect.left + track.clientLeft + progressWidth;
  timeProgress.style.width = `${progressWidth}px`;
  playhead.style.left = `${left}px`;
}

function createTileSlotView(index) {
  let context = null;
  let select = null;
  let body = null;
  let view = null;
  let mountedMode = null;
  return {
    mode: 'tile',
    mount(nextContext) {
      context = nextContext;
      const toolbar = nextContext.doc.createElement('div');
      toolbar.className = 'jve-tile-toolbar';
      select = nextContext.doc.createElement('select');
      for (const mode of JOURNEY_VIDEO_EDITOR_TILE_MODES) {
        const option = nextContext.doc.createElement('option');
        option.value = mode;
        option.textContent = tileLabel(mode);
        select.append(option);
      }
      select.addEventListener('change', () => {
        nextContext.dispatch({ type: 'setTileMode', index, mode: select.value });
      });
      toolbar.append(select);
      body = nextContext.doc.createElement('div');
      body.className = 'jve-tile-body';
      nextContext.body.replaceChildren(toolbar, body);
    },
    update(snapshot) {
      if (!context || !select || !body) return;
      const mode = snapshot.editorState.tileModes?.[index] ?? 'xy';
      select.value = mode;
      if (mountedMode !== mode) {
        disposeNestedView();
        body.replaceChildren();
        view = createJourneyVideoEditorView(mode);
        mountedMode = mode;
        try {
          Promise.resolve(view.mount({ ...context, body })).catch(context.reportError);
        } catch (error) {
          context.reportError(error);
          view = null;
          mountedMode = null;
          return;
        }
      }
      view?.update?.(snapshot);
    },
    resize(size) {
      view?.resize?.(size);
    },
    dispose() {
      disposeNestedView();
      context?.body.replaceChildren();
      context = null;
      select = null;
      body = null;
    },
  };

  function disposeNestedView() {
    try {
      Promise.resolve(view?.dispose?.()).catch((error) => context?.reportError?.(error));
    } catch (error) {
      context?.reportError?.(error);
    }
    view = null;
    mountedMode = null;
  }
}

function renderGuideWidget(context, snapshot, guide) {
  const doc = context.doc;
  const selected = isSelected(snapshot, 'guide', guide.id);
  const card = doc.createElement('section');
  card.className = 'jve-widget-card jve-guide-widget';
  if (selected) card.classList.add('is-selected', 'is-expanded');
  const summary = widgetSummary(context, {
    type: 'guide',
    id: guide.id,
    label: guide.label ?? guide.id,
    meta: pointText(guide.positionPc),
    selected,
  });
  card.append(summary);
  if (selected) {
    const editor = doc.createElement('div');
    editor.className = 'jve-widget-editor';
    editor.append(
      field(doc, 'Label', textInput(doc, guide.label ?? '', (value) => {
        context.dispatch({ type: 'patchWidget', widgetType: 'guide', id: guide.id, patch: { label: value } });
      })),
      vectorEditor(doc, 'Position', guide.positionPc, (pointPc) => {
        context.dispatch({ type: 'updateWidgetPoint', widgetType: 'guide', id: guide.id, pointPc });
      }),
      field(doc, 'Color', colorInput(doc, guide.color ?? '#8fd5ff', (value) => {
        context.dispatch({ type: 'patchWidget', widgetType: 'guide', id: guide.id, patch: { color: value } });
      })),
      field(doc, 'Radius', numberInput(doc, guide.radiusPc ?? guide.sizePc ?? 1, (value) => {
        context.dispatch({ type: 'patchWidget', widgetType: 'guide', id: guide.id, patch: { radiusPc: value, sizePc: value } });
      }, { step: 0.05 })),
      destructiveRow(doc, button(doc, 'Delete', () => {
        context.dispatch({ type: 'deleteWidget', widgetType: 'guide', id: guide.id });
      }, 'is-danger')),
    );
    card.append(editor);
  }
  return card;
}

function renderWaypointFlowWidget(context, snapshot, entry) {
  const doc = context.doc;
  const selected = isSelected(snapshot, entry.type, entry.waypoint.id);
  const card = doc.createElement('section');
  card.className = 'jve-widget-card jve-waypoint-widget';
  card.dataset.widgetType = entry.type;
  if (entry.waypoint.motionGroup?.role) card.dataset.motionRole = String(entry.waypoint.motionGroup.role);
  if (selected) card.classList.add('is-selected', 'is-expanded');
  card.append(widgetSummary(context, {
    type: entry.type,
    id: entry.waypoint.id,
    icon: iconForWidgetType(entry.type),
    label: entry.label,
    meta: `${formatNumber(entry.waypoint.timeSecs)}s`,
    selected,
  }));
  if (selected) card.append(renderWaypointEditor(context, snapshot, entry));
  return card;
}

function renderWaypointEditor(context, snapshot, entry) {
  const doc = context.doc;
  const editor = doc.createElement('div');
  editor.className = 'jve-widget-editor';
  editor.append(field(doc, 'Time', numberInput(doc, entry.waypoint.timeSecs ?? 0, (timeSecs) => {
    context.dispatch({ type: 'updateWidgetTime', widgetType: entry.type, id: entry.waypoint.id, timeSecs });
  }, { step: 0.05 })));
  if (entry.type === 'camera') {
    editor.append(vectorEditor(doc, 'Target', entry.waypoint.targetPc ?? snapshot.evaluated.targetPc, (pointPc) => {
      context.dispatch({ type: 'updateWidgetPoint', widgetType: 'camera', id: entry.waypoint.id, pointPc });
    }));
  } else {
    editor.append(vectorEditor(doc, 'Position', entry.waypoint.positionPc, (pointPc) => {
      context.dispatch({ type: 'updateWidgetPoint', widgetType: 'location', id: entry.waypoint.id, pointPc });
    }));
  }
  if (entry.type === 'location' && entry.waypoint.motionGroup?.id) {
    const group = entry.waypoint.motionGroup;
    const row = doc.createElement('div');
    row.className = 'jve-button-row';
    row.append(
      button(doc, 'Select ease group', () => {
        context.dispatch({
          type: 'selectLocationGroup',
          groupId: group.id,
          phase: group.phase === 'start' || group.phase === 'end' ? group.phase : null,
        });
      }),
      button(doc, 'Rebuild ease', () => {
        context.dispatch({ type: 'rebuildEaseGroup', groupId: group.id, phase: group.phase });
      }),
      button(doc, 'Delete ease helpers', () => {
        context.dispatch({ type: 'deleteEaseHelpers', groupId: group.id, phase: group.phase });
      }),
    );
    editor.append(row);
  }
  editor.append(destructiveRow(doc, button(doc, 'Delete', () => {
    context.dispatch({ type: 'deleteWidget', widgetType: entry.type, id: entry.waypoint.id });
  }, 'is-danger')));
  return editor;
}

function renderRangeEditor(context, snapshot, range) {
  const doc = context.doc;
  const section = doc.createElement('section');
  section.className = 'jve-widget-card is-expanded';
  section.append(panelHeading(doc, 'Location range'));
  section.append(keyValueGrid(doc, [
    ['from', range.anchorId],
    ['to', range.focusId],
    ['waypoints', String(range.stats?.waypointCount ?? 0)],
    ['distance', `${Number(range.stats?.totalLengthPc ?? 0).toFixed(2)} pc`],
    ['avg speed', `${Number(range.stats?.averageSpeedPcPerSec ?? 0).toFixed(2)} pc/s`],
  ]));
  const row = doc.createElement('div');
  row.className = 'jve-button-row';
  row.append(
    button(doc, 'Equalize speed', () => context.dispatch({ type: 'equalizeLocationRange', anchorId: range.anchorId, focusId: range.focusId })),
    button(doc, 'Ease start/end', () => context.dispatch({ type: 'easeLocationRange', anchorId: range.anchorId, focusId: range.focusId })),
  );
  section.append(row);
  return section;
}

function renderTimelineWidget(context, snapshot, entry) {
  const doc = context.doc;
  const buttonEl = button(doc, entry.label, (event) => {
    context.dispatch({
      type: 'selectWidget',
      widgetType: entry.type,
      id: entry.waypoint.id,
      extendRange: event.shiftKey,
    });
  });
  buttonEl.className = 'jve-timeline-widget';
  buttonEl.dataset.widgetType = entry.type;
  if (entry.waypoint.motionGroup?.role) buttonEl.dataset.motionRole = String(entry.waypoint.motionGroup.role);
  if (isSelected(snapshot, entry.type, entry.waypoint.id)) buttonEl.classList.add('is-selected');
  const duration = Math.max(0.1, Number(snapshot.journey.durationSecs ?? 0));
  buttonEl.style.left = `${(Number(entry.waypoint.timeSecs ?? 0) / duration) * 100}%`;
  buttonEl.addEventListener('pointerdown', (event) => beginTimelineDrag(context, snapshot, entry, buttonEl, event));
  return buttonEl;
}

function beginTimelineDrag(context, snapshot, entry, buttonEl, event) {
  event.preventDefault();
  context.dispatch({
    type: 'selectWidget',
    widgetType: entry.type,
    id: entry.waypoint.id,
    extendRange: event.shiftKey,
  });
  const track = buttonEl.parentElement;
  if (!track) return;
  const rect = track.getBoundingClientRect();
  const duration = Math.max(0.1, Number(snapshot.journey.durationSecs ?? 0));
  const move = (moveEvent) => {
    const percent = clamp((moveEvent.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    context.dispatch({
      type: 'updateWidgetTime',
      widgetType: entry.type,
      id: entry.waypoint.id,
      timeSecs: snapTime(percent * duration),
    });
  };
  const done = () => {
    globalThis.removeEventListener('pointermove', move);
    globalThis.removeEventListener('pointerup', done);
  };
  globalThis.addEventListener('pointermove', move);
  globalThis.addEventListener('pointerup', done, { once: true });
}

function widgetSummary(context, options) {
  const doc = context.doc;
  const summary = button(doc, '', (event) => {
    context.dispatch({
      type: 'selectWidget',
      widgetType: options.type,
      id: options.id,
      extendRange: event.shiftKey,
    });
  });
  summary.className = 'jve-widget-summary';
  if (options.icon) summary.classList.add('has-icon');
  const label = doc.createElement('span');
  label.className = 'jve-widget-label';
  label.textContent = String(options.label ?? options.id);
  const meta = doc.createElement('span');
  meta.className = 'jve-widget-meta';
  meta.textContent = String(options.meta ?? '');
  if (options.icon) summary.append(iconElement(doc, options.icon, 'jve-widget-icon'));
  summary.append(label, meta);
  return summary;
}

function waypointEntries(snapshot) {
  const entries = [
    ...(snapshot.journey.locationWaypoints ?? []).map((waypoint, index) => ({
      type: 'location',
      waypoint,
      label: waypoint.id ?? `Location ${index + 1}`,
    })),
    ...(snapshot.journey.cameraLookWaypoints ?? []).map((waypoint, index) => ({
      type: 'camera',
      waypoint,
      label: waypoint.id ?? `Camera ${index + 1}`,
    })),
  ];
  return entries.sort((left, right) => (
    Number(left.waypoint.timeSecs ?? 0) - Number(right.waypoint.timeSecs ?? 0)
    || (left.type === right.type ? 0 : left.type.localeCompare(right.type))
    || String(left.waypoint.id ?? '').localeCompare(String(right.waypoint.id ?? ''))
  ));
}

function selectedLocationRangeInfo(snapshot) {
  const range = snapshot.editorState.selectedLocationRange;
  if (!range) return null;
  const ids = new Set((snapshot.journey.locationWaypoints ?? []).map((waypoint) => waypoint.id));
  if (!ids.has(range.anchorId) || !ids.has(range.focusId)) return null;
  const selected = (snapshot.journey.locationWaypoints ?? [])
    .filter((waypoint) => waypoint.id === range.anchorId || waypoint.id === range.focusId);
  const [left, right] = selected.sort((a, b) => Number(a.timeSecs ?? 0) - Number(b.timeSecs ?? 0));
  const minTime = Number(left?.timeSecs ?? 0);
  const maxTime = Number(right?.timeSecs ?? minTime);
  const waypoints = (snapshot.journey.locationWaypoints ?? [])
    .filter((waypoint) => Number(waypoint.timeSecs ?? 0) >= minTime && Number(waypoint.timeSecs ?? 0) <= maxTime)
    .sort((a, b) => Number(a.timeSecs ?? 0) - Number(b.timeSecs ?? 0));
  let totalLengthPc = 0;
  for (let index = 1; index < waypoints.length; index += 1) {
    totalLengthPc += pointDistance(waypoints[index - 1].positionPc, waypoints[index].positionPc);
  }
  const durationSecs = Math.max(0, maxTime - minTime);
  return {
    ...range,
    stats: {
      waypointCount: waypoints.length,
      totalLengthPc,
      averageSpeedPcPerSec: durationSecs > 0 ? totalLengthPc / durationSecs : 0,
    },
  };
}

function pointDistance(left, right) {
  return Math.hypot(
    Number(right?.x ?? 0) - Number(left?.x ?? 0),
    Number(right?.y ?? 0) - Number(left?.y ?? 0),
    Number(right?.z ?? 0) - Number(left?.z ?? 0),
  );
}

function timelineLane(doc, labelText) {
  const el = doc.createElement('div');
  el.className = 'jve-lane';
  const label = doc.createElement('span');
  label.textContent = labelText;
  const track = doc.createElement('div');
  track.className = 'jve-lane-track';
  el.append(label, track);
  return { el, track };
}

function field(doc, labelText, input) {
  const wrapper = doc.createElement('label');
  wrapper.className = 'jve-field';
  wrapper.append(span(doc, labelText), input);
  return wrapper;
}

function vectorEditor(doc, labelText, point, onChange) {
  const grid = doc.createElement('div');
  grid.className = 'jve-vector-grid';
  grid.append(span(doc, labelText));
  for (const axis of ['x', 'y', 'z']) {
    grid.append(numberInput(doc, point?.[axis] ?? 0, (value) => {
      onChange({ ...point, [axis]: value });
    }, { step: 0.05 }));
  }
  return grid;
}

function numberInput(doc, value, onChange, options = {}) {
  const input = doc.createElement('input');
  input.type = 'number';
  input.step = String(options.step ?? 0.05);
  if (options.min !== undefined) input.min = String(options.min);
  input.value = formatNumber(value);
  input.addEventListener('change', () => onChange(Number(input.value)));
  return input;
}

function textInput(doc, value, onChange) {
  const input = doc.createElement('input');
  input.value = String(value ?? '');
  input.addEventListener('change', () => onChange(input.value));
  return input;
}

function colorInput(doc, value, onChange) {
  const input = doc.createElement('input');
  input.type = 'color';
  input.value = /^#[0-9a-f]{6}$/iu.test(String(value)) ? String(value) : '#8fd5ff';
  input.addEventListener('input', () => onChange(input.value));
  return input;
}

function button(doc, label, onClick, className = '') {
  const buttonEl = doc.createElement('button');
  buttonEl.type = 'button';
  buttonEl.textContent = label;
  if (className) buttonEl.className = className;
  buttonEl.addEventListener('click', onClick);
  return buttonEl;
}

function iconButton(doc, icon, label, onClick) {
  const buttonEl = button(doc, '', onClick, 'jve-icon-button');
  buttonEl.title = label;
  buttonEl.setAttribute('aria-label', label);
  buttonEl.replaceChildren(iconElement(doc, icon));
  return buttonEl;
}

function iconTextButton(doc, icon, label, onClick, options = {}) {
  const buttonEl = button(doc, '', onClick, 'jve-icon-text-button');
  if (options.ariaLabel) buttonEl.setAttribute('aria-label', options.ariaLabel);
  if (options.title) buttonEl.title = options.title;
  buttonEl.append(span(doc, label), iconElement(doc, icon));
  return buttonEl;
}

function iconElement(doc, icon, className = 'jve-icon') {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [tag, attrs] of icon ?? []) {
    const child = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs ?? {})) {
      child.setAttribute(key, String(value));
    }
    svg.append(child);
  }
  return svg;
}

function iconForWidgetType(type) {
  if (type === 'location') return MapPin;
  if (type === 'camera') return Camera;
  return null;
}

function destructiveRow(doc, child) {
  const row = doc.createElement('div');
  row.className = 'jve-button-row jve-destructive-row';
  row.append(child);
  return row;
}

function panelHeading(doc, text) {
  const heading = doc.createElement('h2');
  heading.textContent = text;
  return heading;
}

function panelTitleBar(doc, text, actions = []) {
  const header = doc.createElement('div');
  header.className = 'jve-view-heading';
  header.append(panelHeading(doc, text));
  if (actions.length > 0) {
    const row = doc.createElement('div');
    row.className = 'jve-view-heading-actions';
    row.append(...actions);
    header.append(row);
  }
  return header;
}

function emptyText(doc, text) {
  const paragraph = doc.createElement('p');
  paragraph.className = 'jve-empty';
  paragraph.textContent = text;
  return paragraph;
}

function span(doc, text) {
  const value = doc.createElement('span');
  value.textContent = text;
  return value;
}

function keyValueGrid(doc, rows) {
  const grid = doc.createElement('dl');
  grid.className = 'jve-key-value-grid';
  grid.append(...keyValueRows(doc, rows));
  return grid;
}

function keyValueRows(doc, rows) {
  const nodes = [];
  for (const [key, value] of rows) {
    const dt = doc.createElement('dt');
    const dd = doc.createElement('dd');
    dt.textContent = key;
    dd.textContent = value;
    nodes.push(dt, dd);
  }
  return nodes;
}

function tileLabel(mode) {
  if (mode === 'xy') return 'XY';
  if (mode === 'xz') return 'XZ';
  if (mode === 'yz') return 'YZ';
  if (mode === 'perspective') return 'Perspective';
  if (mode === 'skykit') return 'SkyKit';
  return mode;
}

function pointText(point) {
  return `${formatNumber(point?.x)} ${formatNumber(point?.y)} ${formatNumber(point?.z)}`;
}

function formatNumber(value) {
  return Number(value ?? 0).toFixed(3).replace(/\.?0+$/u, '');
}

function snapTime(value) {
  return Math.round((Number(value) || 0) / 0.05) * 0.05;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
}

/** @param {string} mode */
function createProjectionView(mode) {
  let context = /** @type {JourneyVideoEditorViewContext | null} */ (null);
  let canvas = /** @type {HTMLCanvasElement | null} */ (null);
  let snapshot = /** @type {JourneyVideoEditorViewSnapshot | null} */ (null);
  let markers = /** @type {Array<Record<string, unknown>>} */ ([]);
  let projection = /** @type {Record<string, unknown> | null} */ (null);

  return {
    mode,
    mount(nextContext) {
      context = nextContext;
      canvas = nextContext.doc.createElement('canvas');
      canvas.className = 'jve-tile-canvas';
      nextContext.body.append(canvas);
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
      canvas?.remove();
      canvas = null;
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
      bounds: snapshot.projectionData.bounds,
      width,
      height,
      zoom: Number(snapshot.editorState.zoom ?? 1),
      center: snapshot.evaluated.observerPc,
    });
    markers = drawProjection(drawing, snapshot, projection);
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
      const [axisA, axisB] = dragProjection.axes;
      const next = { ...currentPoint };
      next[axisA] = dragProjection.centerA + (canvasPos.x - dragProjection.width / 2) / dragProjection.scale;
      next[axisB] = dragProjection.centerB - (canvasPos.y - dragProjection.height / 2) / dragProjection.scale;
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

function createPerspectiveView() {
  let canvas = /** @type {HTMLCanvasElement | null} */ (null);
  let renderer = /** @type {THREE.WebGLRenderer | null} */ (null);
  let controls = /** @type {OrbitControls | null} */ (null);
  let snapshot = /** @type {JourneyVideoEditorViewSnapshot | null} */ (null);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.001, 100000);
  const root = new THREE.Group();
  scene.add(root);
  scene.background = new THREE.Color(0x02050b);

  return {
    mode: 'perspective',
    mount(context) {
      canvas = context.doc.createElement('canvas');
      canvas.className = 'jve-tile-canvas';
      context.body.append(canvas);
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      controls = new OrbitControls(camera, canvas);
    },
    update(nextSnapshot) {
      snapshot = nextSnapshot;
      renderSnapshot();
    },
    resize() {
      renderSnapshot();
    },
    dispose() {
      disposeObjectChildren(root);
      renderer?.dispose();
      controls?.dispose();
      canvas?.remove();
      renderer = null;
      controls = null;
      canvas = null;
      snapshot = null;
    },
  };

  function renderSnapshot() {
    if (!canvas || !renderer || !controls || !snapshot) return;
    const { width, height } = syncCanvas(canvas);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    disposeObjectChildren(root);
    const bounds = snapshot.projectionData.bounds;
    const center = vector3(pointPcToRenderUnits(snapshot.evaluated.observerPc, snapshot.world));
    const minDistance = Math.max(0.1, scalarPcToRenderUnits(30, snapshot.world));
    const distance = Math.max(
      minDistance,
      scalarPcToRenderUnits(bounds.span, snapshot.world) / Math.max(0.2, Number(snapshot.editorState.zoom ?? 1)),
    );
    camera.position.copy(center).add(new THREE.Vector3(distance, distance * 0.6, distance));
    controls.target.copy(center);
    controls.update();
    addPerspectiveContent(root, snapshot);
    renderer.render(scene, camera);
  }
}

function createSkykitView() {
  let shell = /** @type {HTMLDivElement | null} */ (null);
  let disposed = false;
  let ready = false;
  let viewer = null;
  let loop = null;
  let provider = null;
  let renderer = null;
  let pendingSnapshot = /** @type {JourneyVideoEditorViewSnapshot | null} */ (null);
  const guideGroup = new THREE.Group();
  guideGroup.name = 'journey-video-editor-guides';

  return {
    mode: 'skykit',
    mount(nextContext) {
      shell = nextContext.doc.createElement('div');
      shell.className = 'jve-skykit-tile';
      nextContext.body.append(shell);
      const world = nextContext.world ?? createJourneyVideoWorld(nextContext.preview);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      const camera = new THREE.PerspectiveCamera(60, 1, 0.001, 10000);
      provider = createStarOctreeProviderService({
        url: String(nextContext.preview?.octreeUrl ?? OCTREE_DEFAULT),
      });
      const starField = createThreeStarField({
        renderScale: world.renderScale,
        limitingMagnitude: world.limitingMagnitude,
        coordinateUnitsPerParsec: world.coordinateUnitsPerParsec,
      });
      createSkykitViewer({
        host: shell,
        renderer,
        camera,
        view: {
          coordinateUnitsPerParsec: world.coordinateUnitsPerParsec,
          limitingMagnitude: world.limitingMagnitude,
        },
        plugins: [
          createStreamingStarsPlugin({
            provider,
            renderer: starField,
            session: { strategy: createObserverShellStrategy() },
          }),
          createObject3dPlugin({
            id: 'journey-guides',
            object3d: guideGroup,
            anchorMode: 'world-space',
          }),
        ],
      }).then((created) => {
        if (disposed) {
          void created.dispose();
          return;
        }
        viewer = created;
        loop = createSkykitAnimationLoop(viewer, { render: true });
        loop.start();
        ready = true;
        applySkykitState();
      }).catch((error) => nextContext.reportError(error));
    },
    update(snapshot) {
      pendingSnapshot = snapshot;
      if (ready) applySkykitState();
    },
    resize() {
      viewer?.resize?.();
    },
    async dispose() {
      disposed = true;
      ready = false;
      loop?.dispose?.();
      await viewer?.dispose?.();
      provider?.dispose?.();
      renderer?.dispose?.();
      disposeObjectChildren(guideGroup);
      shell?.remove();
      loop = null;
      viewer = null;
      provider = null;
      renderer = null;
      shell = null;
      pendingSnapshot = null;
    },
  };

  function applySkykitState() {
    if (!viewer || !pendingSnapshot) return;
    syncJourneyVideoGuideGroup(guideGroup, pendingSnapshot.journey, pendingSnapshot.world);
    viewer.requestViewState({
      observerPc: pendingSnapshot.evaluated.observerPc,
      orientationIcrs: pendingSnapshot.evaluated.orientationIcrs,
      targetPc: pendingSnapshot.evaluated.targetPc,
      limitingMagnitude: pendingSnapshot.world.limitingMagnitude,
    }, 'journey-video-editor');
    viewer.resize();
  }
}

/**
 * @param {CanvasRenderingContext2D} context
 * @param {JourneyVideoEditorViewSnapshot} snapshot
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
  for (let index = -16; index <= 16; index += 1) {
    context.beginPath();
    context.moveTo(width / 2 + index * 44 * Number(snapshot.editorState.zoom ?? 1), 0);
    context.lineTo(width / 2 + index * 44 * Number(snapshot.editorState.zoom ?? 1), height);
    context.moveTo(0, height / 2 + index * 44 * Number(snapshot.editorState.zoom ?? 1));
    context.lineTo(width, height / 2 + index * 44 * Number(snapshot.editorState.zoom ?? 1));
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
    context.arc(point.x, point.y, Math.max(4, Number(guide.radiusPc ?? 1) * Number(projection.scale ?? 1)), 0, Math.PI * 2);
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

/** @param {THREE.Group} root @param {JourneyVideoEditorViewSnapshot} snapshot */
function addPerspectiveContent(root, snapshot) {
  for (const sample of snapshot.samples) {
    const point = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.003, scalarPcToRenderUnits(0.15, snapshot.world)), 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xf2f6ff }),
    );
    point.position.copy(vector3(pointPcToRenderUnits(sample.observerPc, snapshot.world)));
    root.add(point);
  }
  root.add(createJourneyVideoGuideGroup(snapshot.journey, snapshot.world));
  for (const waypoint of snapshot.journey.locationWaypoints ?? []) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.004, scalarPcToRenderUnits(0.35, snapshot.world)), 16, 8),
      new THREE.MeshBasicMaterial({ color: isSelected(snapshot, 'location', waypoint.id) ? 0xffb454 : 0x5be7c4 }),
    );
    mesh.position.copy(vector3(pointPcToRenderUnits(waypoint.positionPc, snapshot.world)));
    root.add(mesh);
  }
}

function syncCanvas(canvas) {
  const scale = Math.min(globalThis.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor((canvas.clientWidth || 1) * scale));
  const height = Math.max(1, Math.floor((canvas.clientHeight || 1) * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, scale, context: canvas.getContext('2d') };
}

function canvasPoint(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
    y: (clientY - rect.top) * (canvas.height / Math.max(1, rect.height)),
  };
}

function vector3(point) {
  return new THREE.Vector3(Number(point?.x ?? 0), Number(point?.y ?? 0), Number(point?.z ?? 0));
}

function widgetPoint(journey, type, id) {
  const widget = findWidget(journey, type, id);
  if (!widget) return null;
  if (type === 'camera') return widget.kind === 'target' ? widget.targetPc : null;
  return widget.positionPc;
}

function findWidget(journey, type, id) {
  if (type === 'location') return journey.locationWaypoints?.find((entry) => entry.id === id) ?? null;
  if (type === 'camera') return journey.cameraLookWaypoints?.find((entry) => entry.id === id) ?? null;
  if (type === 'guide') return journey.guides?.find((entry) => entry.id === id) ?? null;
  return null;
}

function isSelected(snapshot, type, id) {
  return snapshot.editorState.selectedWidget?.type === type && snapshot.editorState.selectedWidget.id === id;
}
