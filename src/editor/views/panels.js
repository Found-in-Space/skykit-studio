// @ts-nocheck
import {
  getJourneyLocationRangeSpeedStats,
  easeTimedJourneyLocationRange,
  equalizeTimedJourneyLocationRangeSpeed,
} from '../../camera-timeline.js';
import { Camera, MapPin, Plus } from 'lucide';

import {
  CAMERA_WAYPOINT_KINDS,
  normalizeCameraWaypointKind,
} from '../camera-waypoints.js';
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
  quaternionEditor,
  selectInput,
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
      const brand = nextContext.services?.brand ?? {};
      const header = nextContext.doc.createElement('header');
      header.className = 'jve-brand-header';
      const markUrl = String(brand.markUrl ?? '');
      if (markUrl) {
        header.classList.add('has-mark');
        const mark = nextContext.doc.createElement('img');
        mark.className = 'jve-brand-mark';
        mark.src = markUrl;
        mark.alt = '';
        mark.setAttribute('aria-hidden', 'true');
        mark.addEventListener('error', () => {
          mark.remove();
          header.classList.remove('has-mark');
        }, { once: true });
        header.append(mark);
      }
      const copy = nextContext.doc.createElement('div');
      copy.className = 'jve-brand-copy';
      const eyebrowText = String(brand.eyebrow ?? '');
      if (eyebrowText) {
        const eyebrow = nextContext.doc.createElement('p');
        eyebrow.className = 'jve-eyebrow';
        eyebrow.textContent = eyebrowText;
        copy.append(eyebrow);
      }
      const title = nextContext.doc.createElement('h1');
      title.textContent = String(brand.title ?? 'SkyKit Studio');
      copy.append(title);
      header.append(copy);
      stats = nextContext.doc.createElement('dl');
      stats.className = 'jve-stats';
      nextContext.body.replaceChildren(header, stats);
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
      field(doc, 'Type', selectInput(doc, guide.shape === 'cube' ? 'cube' : 'sphere', [
        { value: 'sphere', label: 'Sphere' },
        { value: 'cube', label: 'Cube' },
      ], (value) => {
        context.dispatch({
          type: 'patchWidget',
          widgetType: 'guide',
          id: guide.id,
          patch: { shape: value === 'cube' ? 'cube' : 'sphere' },
        });
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
  if (entry.type === 'camera') card.dataset.cameraKind = normalizeCameraWaypointKind(entry.waypoint.kind);
  if (entry.waypoint.motionGroup?.role) card.dataset.motionRole = String(entry.waypoint.motionGroup.role);
  if (selected) card.classList.add('is-selected', 'is-expanded');
  if (entry.type === 'location' && isWaypointInSelectedLocationGroup(snapshot, entry.waypoint)) {
    card.classList.add('is-in-group');
  }
  card.append(widgetSummary(context, {
    type: entry.type,
    id: entry.waypoint.id,
    icon: iconForWidgetType(entry.type),
    label: entry.label,
    meta: entry.type === 'camera'
      ? `${formatNumber(entry.waypoint.timeSecs)}s ${normalizeCameraWaypointKind(entry.waypoint.kind)}`
      : `${formatNumber(entry.waypoint.timeSecs)}s`,
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
    appendCameraWaypointEditor(context, snapshot, editor, entry.waypoint);
  } else {
    editor.append(vectorEditor(doc, 'Position', entry.waypoint.positionPc, (pointPc) => {
      context.dispatch({ type: 'updateWidgetPoint', widgetType: 'location', id: entry.waypoint.id, pointPc });
    }));
  }
  if (entry.type === 'location' && entry.waypoint.motionGroup?.id) {
    const group = entry.waypoint.motionGroup;
    editor.append(field(doc, 'Ease secs', numberInput(doc, group.easeSecs ?? snapshot.editorState.easeSecs ?? 3, (easeSecs) => {
      context.dispatch({ type: 'setEaseSecs', easeSecs });
    }, { min: 0.05, step: 0.05 })));
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

function appendCameraWaypointEditor(context, snapshot, editor, waypoint) {
  const doc = context.doc;
  const kind = normalizeCameraWaypointKind(waypoint.kind);
  editor.append(field(doc, 'Mode', selectInput(doc, kind, CAMERA_WAYPOINT_KINDS.map((value) => ({
    value,
    label: value,
  })), (value) => {
    context.dispatch({ type: 'patchWidget', widgetType: 'camera', id: waypoint.id, patch: { kind: value } });
  })));
  if (kind === 'target') {
    editor.append(
      field(doc, 'Guide', guideTargetPicker(context, snapshot, waypoint)),
      vectorEditor(doc, 'Target', waypoint.targetPc ?? snapshot.evaluated.targetPc, (pointPc) => {
        context.dispatch({ type: 'patchWidget', widgetType: 'camera', id: waypoint.id, patch: { targetPc: pointPc } });
      }),
      vectorEditor(doc, 'Up', waypoint.up ?? snapshot.evaluated.cameraUpPc, (pointPc) => {
        context.dispatch({ type: 'patchWidget', widgetType: 'camera', id: waypoint.id, patch: { up: pointPc } });
      }),
    );
    return;
  }
  if (kind === 'quaternion') {
    editor.append(quaternionEditor(doc, 'Orientation', waypoint.orientation ?? snapshot.evaluated.orientationIcrs, (orientation) => {
      context.dispatch({ type: 'patchWidget', widgetType: 'camera', id: waypoint.id, patch: { orientation } });
    }));
    return;
  }
  editor.append(
    vectorEditor(doc, 'Forward', waypoint.forward ?? snapshot.evaluated.cameraForwardPc, (pointPc) => {
      context.dispatch({ type: 'patchWidget', widgetType: 'camera', id: waypoint.id, patch: { forward: pointPc } });
    }),
    vectorEditor(doc, 'Up', waypoint.up ?? snapshot.evaluated.cameraUpPc, (pointPc) => {
      context.dispatch({ type: 'patchWidget', widgetType: 'camera', id: waypoint.id, patch: { up: pointPc } });
    }),
  );
}

function guideTargetPicker(context, snapshot, waypoint) {
  const doc = context.doc;
  const select = doc.createElement('select');
  const placeholder = doc.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Copy guide position...';
  select.append(placeholder);
  let matchedGuideId = '';
  for (const guide of snapshot.journey.guides ?? []) {
    const guideLabel = guide.label || guide.id;
    const option = doc.createElement('option');
    option.value = guide.id;
    option.textContent = guideLabel;
    select.append(option);
    if (
      waypoint.targetGuide
      && (waypoint.targetGuide.id === guide.id || (!matchedGuideId && waypoint.targetGuide.label === guideLabel))
    ) {
      matchedGuideId = guide.id;
    }
  }
  select.value = matchedGuideId;
  select.addEventListener('change', () => {
    const guide = (snapshot.journey.guides ?? []).find((entry) => entry.id === select.value);
    if (!guide) return;
    context.dispatch({
      type: 'patchWidget',
      widgetType: 'camera',
      id: waypoint.id,
      patch: {
        targetPc: guide.positionPc,
        targetGuide: { id: guide.id, label: guide.label || guide.id },
      },
    });
  });
  return select;
}

function renderRangeEditor(context, snapshot, range) {
  const doc = context.doc;
  const section = doc.createElement('section');
  section.className = 'jve-widget-card is-expanded';
  section.append(panelHeading(doc, 'Location range'));
  const easeSecs = clampEaseSecs(snapshot.editorState.easeSecs, range.stats);
  const retimeOptions = {
    anchorId: range.anchorId,
    focusId: range.focusId,
    easeSecs,
    rampSampleSecs: 0.5,
    timeStepSecs: 0.05,
  };
  const equalizePreview = equalizeTimedJourneyLocationRangeSpeed(snapshot.journey, retimeOptions);
  const easePreview = easeTimedJourneyLocationRange(snapshot.journey, retimeOptions);
  section.append(
    field(doc, 'Ease secs', numberInput(doc, easeSecs, (value) => {
      context.dispatch({ type: 'setEaseSecs', easeSecs: value });
    }, { min: 0.05, step: 0.05 })),
    rangeDiagnosticSection(doc, 'Before', range.stats),
    rangeDiagnosticSection(doc, 'After equalize', equalizePreview.after),
    rangeDiagnosticSection(doc, 'After ease', easePreview.after, [
      ['ease secs', `${formatNumber(easePreview.effectiveEaseSecs ?? easeSecs)}s`],
      ['helpers', String(easePreview.insertedIds.length)],
    ]),
  );
  const row = doc.createElement('div');
  row.className = 'jve-button-row';
  const equalizeButton = button(doc, 'Equalize speed', () => context.dispatch({ type: 'equalizeLocationRange', anchorId: range.anchorId, focusId: range.focusId }));
  equalizeButton.disabled = !range.stats || equalizePreview.changedIds.length === 0;
  const easeButton = button(doc, 'Ease start/end', () => context.dispatch({ type: 'easeLocationRange', anchorId: range.anchorId, focusId: range.focusId }));
  easeButton.disabled = !range.stats || (easePreview.changedIds.length === 0 && easePreview.insertedIds.length === 0);
  row.append(
    equalizeButton,
    easeButton,
  );
  section.append(row);
  return section;
}

function rangeDiagnosticSection(doc, title, stats, extraRows = []) {
  const section = doc.createElement('div');
  section.className = 'jve-diagnostic-section';
  section.append(panelHeading(doc, title));
  if (!stats) {
    section.append(emptyText(doc, 'No range data'));
    return section;
  }
  section.append(keyValueGrid(doc, [
    ['from', stats.startId],
    ['to', stats.endId],
    ['waypoints', String(stats.waypointCount)],
    ['distance', `${formatNumber(stats.totalLengthPc)} pc`],
    ['avg speed', `${formatNumber(stats.averageSpeedPcPerSec)} pc/s`],
    ['min speed', `${formatNumber(stats.minSpeedPcPerSec)} pc/s`],
    ['max speed', `${formatNumber(stats.maxSpeedPcPerSec)} pc/s`],
    ...extraRows,
  ]));
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
  return {
    ...range,
    stats: getJourneyLocationRangeSpeedStats(snapshot.journey.locationWaypoints, range.anchorId, range.focusId),
  };
}

function isWaypointInSelectedLocationGroup(snapshot, waypoint) {
  const groupId = snapshot.editorState.selectedLocationGroupId;
  if (!groupId || !waypoint?.motionGroup) return false;
  const group = waypoint.motionGroup;
  return group.id === groupId
    && group.kind === 'ease'
    && (!snapshot.editorState.selectedLocationGroupPhase || group.phase === snapshot.editorState.selectedLocationGroupPhase);
}

function clampEaseSecs(value, stats) {
  const maxEaseSecs = Math.max(0.05, Number(stats?.durationSecs ?? 0) / 2 || 0.05);
  return Math.min(maxEaseSecs, Math.max(0.05, Number(value ?? 3)));
}

function iconForWidgetType(type) {
  if (type === 'location') return MapPin;
  if (type === 'camera') return Camera;
  return null;
}
