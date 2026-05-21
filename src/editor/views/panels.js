// @ts-nocheck
import { Camera, MapPin, Plus } from 'lucide';

import {
  button,
  colorInput,
  destructiveRow,
  emptyText,
  field,
  formatNumber,
  iconButton,
  iconElement,
  iconTextButton,
  isSelected,
  keyValueGrid,
  keyValueRows,
  numberInput,
  panelHeading,
  panelTitleBar,
  pointText,
  span,
  textInput,
  vectorEditor,
} from './shared.js';

export function createStateSummaryView() {
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

export function createDurationView() {
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

export function createStorageView() {
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

export function createGuideFlowView() {
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

export function createWaypointEditorView() {
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

export function createStatusView() {
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

function iconForWidgetType(type) {
  if (type === 'location') return MapPin;
  if (type === 'camera') return Camera;
  return null;
}
