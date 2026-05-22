// @ts-nocheck
import {
  ArrowLeft,
  ArrowRight,
  Grid2X2,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
} from 'lucide';

import {
  JOURNEY_VIDEO_EDITOR_PANE_LAYOUT_PRESETS,
  JOURNEY_VIDEO_EDITOR_TILE_MODES,
} from '../panes.js';
import { iconElement, tileLabel } from './shared.js';

export function renderPaneToolbar({
  doc,
  toolbar,
  pane,
  layout,
  paneCount,
  dispatch,
}) {
  const select = doc.createElement('select');
  select.setAttribute('aria-label', 'Pane view');
  for (const mode of JOURNEY_VIDEO_EDITOR_TILE_MODES) {
    const option = doc.createElement('option');
    option.value = mode;
    option.textContent = tileLabel(mode);
    select.append(option);
  }
  select.value = pane.mode;
  select.addEventListener('change', () => {
    dispatch({ type: 'setPaneMode', paneId: pane.id, mode: select.value });
  });

  const actions = doc.createElement('div');
  actions.className = 'jve-pane-actions';
  const expanded = layout.preset === 'single' && layout.primaryPaneId === pane.id;
  actions.append(
    paneIconButton(doc, ArrowLeft, 'Move pane left', () => {
      dispatch({ type: 'movePane', paneId: pane.id, direction: 'previous' });
    }),
    paneIconButton(doc, ArrowRight, 'Move pane right', () => {
      dispatch({ type: 'movePane', paneId: pane.id, direction: 'next' });
    }),
    paneIconButton(doc, expanded ? Minimize2 : Maximize2, expanded ? 'Restore panes' : 'Expand pane', () => {
      if (expanded) dispatch({ type: 'restorePaneLayout' });
      else dispatch({ type: 'setPaneLayout', preset: 'single', paneIds: [pane.id] });
    }),
    paneIconButton(doc, Plus, 'Add pane', () => {
      dispatch({ type: 'addPane' });
    }, { disabled: paneCount >= 4 }),
    paneIconButton(doc, Trash2, 'Remove pane', () => {
      dispatch({ type: 'removePane', paneId: pane.id });
    }, { disabled: paneCount <= 1 }),
  );

  toolbar.replaceChildren(select, actions);
}

export function renderPaneLayoutToolbar({
  doc,
  body,
  snapshot,
  dispatch,
}) {
  const group = doc.createElement('div');
  group.className = 'jve-pane-layout-controls';

  const label = doc.createElement('label');
  label.className = 'jve-inline-control';
  const icon = iconElement(doc, Grid2X2);
  const select = doc.createElement('select');
  select.setAttribute('aria-label', 'Pane layout');
  for (const preset of JOURNEY_VIDEO_EDITOR_PANE_LAYOUT_PRESETS) {
    const option = doc.createElement('option');
    option.value = preset;
    option.textContent = paneLayoutLabel(preset);
    select.append(option);
  }
  select.value = snapshot.editorState.paneLayout?.preset ?? 'four-grid';
  select.addEventListener('change', () => {
    dispatch({ type: 'setPaneLayout', preset: select.value });
  });
  label.append(icon, select);

  group.append(
    label,
    paneIconButton(doc, Plus, 'Add pane', () => {
      dispatch({ type: 'addPane' });
    }, { disabled: (snapshot.editorState.panes?.length ?? 0) >= 4 }),
  );
  body.replaceChildren(group);
}

export function paneLayoutLabel(preset) {
  if (preset === 'single') return 'Single';
  if (preset === 'two-stacked') return 'Two stacked';
  if (preset === 'two-side-by-side') return 'Two side by side';
  if (preset === 'three-primary-left') return 'Three, primary left';
  if (preset === 'three-primary-right') return 'Three, primary right';
  if (preset === 'four-grid') return 'Four grid';
  return String(preset ?? '');
}

function paneIconButton(doc, icon, label, onClick, options = {}) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'jve-icon-button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.disabled = options.disabled === true;
  button.replaceChildren(iconElement(doc, icon));
  button.addEventListener('click', onClick);
  return button;
}
