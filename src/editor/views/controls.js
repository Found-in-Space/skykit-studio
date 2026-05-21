// @ts-nocheck
import { DEFAULT_EDITOR_UNITS_PER_PARSEC } from '../../index.js';
import { normalizeCameraWaypointKind } from '../camera-waypoints.js';

import {
  button,
  clamp,
  formatNumber,
  isSelected,
  snapTime,
  span,
} from './shared.js';

export function createScaleView() {
  let context = null;
  let input = null;
  let value = null;
  return {
    mode: 'scale',
    mount(nextContext) {
      context = nextContext;
      const label = nextContext.doc.createElement('label');
      label.className = 'jve-inline-control';
      label.append(span(nextContext.doc, 'Scale'));
      input = nextContext.doc.createElement('input');
      input.type = 'range';
      input.min = '0.25';
      input.max = '80';
      input.step = '0.05';
      input.addEventListener('input', () => {
        nextContext.dispatch({ type: 'setUnitsPerParsec', unitsPerParsec: Number(input.value) });
      });
      value = nextContext.doc.createElement('span');
      label.append(input, value);
      nextContext.body.replaceChildren(label);
    },
    update(snapshot) {
      if (!input || !value) return;
      const unitsPerParsec = Number(snapshot.editorState.unitsPerParsec ?? DEFAULT_EDITOR_UNITS_PER_PARSEC);
      if (input !== input.ownerDocument.activeElement) input.value = String(unitsPerParsec);
      value.textContent = `${formatNumber(unitsPerParsec)} u/pc`;
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

export function createTransportView() {
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

export function createTimelineView() {
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
  if (entry.type === 'camera') buttonEl.dataset.cameraKind = normalizeCameraWaypointKind(entry.waypoint.kind);
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
