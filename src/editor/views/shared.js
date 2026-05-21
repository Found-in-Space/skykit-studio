// @ts-nocheck
import * as THREE from 'three';

export function field(doc, labelText, input) {
  const wrapper = doc.createElement('label');
  wrapper.className = 'jve-field';
  wrapper.append(span(doc, labelText), input);
  return wrapper;
}

export function vectorEditor(doc, labelText, point, onChange) {
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

export function numberInput(doc, value, onChange, options = {}) {
  const input = doc.createElement('input');
  input.type = 'number';
  input.step = String(options.step ?? 0.05);
  if (options.min !== undefined) input.min = String(options.min);
  input.value = formatNumber(value);
  input.addEventListener('change', () => onChange(Number(input.value)));
  return input;
}

export function textInput(doc, value, onChange) {
  const input = doc.createElement('input');
  input.value = String(value ?? '');
  input.addEventListener('change', () => onChange(input.value));
  return input;
}

export function colorInput(doc, value, onChange) {
  const input = doc.createElement('input');
  input.type = 'color';
  input.value = /^#[0-9a-f]{6}$/iu.test(String(value)) ? String(value) : '#8fd5ff';
  input.addEventListener('input', () => onChange(input.value));
  return input;
}

export function button(doc, label, onClick, className = '') {
  const buttonEl = doc.createElement('button');
  buttonEl.type = 'button';
  buttonEl.textContent = label;
  if (className) buttonEl.className = className;
  buttonEl.addEventListener('click', onClick);
  return buttonEl;
}

export function iconButton(doc, icon, label, onClick) {
  const buttonEl = button(doc, '', onClick, 'jve-icon-button');
  buttonEl.title = label;
  buttonEl.setAttribute('aria-label', label);
  buttonEl.replaceChildren(iconElement(doc, icon));
  return buttonEl;
}

export function iconTextButton(doc, icon, label, onClick, options = {}) {
  const buttonEl = button(doc, '', onClick, 'jve-icon-text-button');
  if (options.ariaLabel) buttonEl.setAttribute('aria-label', options.ariaLabel);
  if (options.title) buttonEl.title = options.title;
  buttonEl.append(span(doc, label), iconElement(doc, icon));
  return buttonEl;
}

export function iconElement(doc, icon, className = 'jve-icon') {
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

export function destructiveRow(doc, child) {
  const row = doc.createElement('div');
  row.className = 'jve-button-row jve-destructive-row';
  row.append(child);
  return row;
}

export function panelHeading(doc, text) {
  const heading = doc.createElement('h2');
  heading.textContent = text;
  return heading;
}

export function panelTitleBar(doc, text, actions = []) {
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

export function emptyText(doc, text) {
  const paragraph = doc.createElement('p');
  paragraph.className = 'jve-empty';
  paragraph.textContent = text;
  return paragraph;
}

export function span(doc, text) {
  const value = doc.createElement('span');
  value.textContent = text;
  return value;
}

export function keyValueGrid(doc, rows) {
  const grid = doc.createElement('dl');
  grid.className = 'jve-key-value-grid';
  grid.append(...keyValueRows(doc, rows));
  return grid;
}

export function keyValueRows(doc, rows) {
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

export function tileLabel(mode) {
  if (mode === 'xy') return 'XY';
  if (mode === 'xz') return 'XZ';
  if (mode === 'yz') return 'YZ';
  if (mode === 'perspective') return 'Perspective';
  if (mode === 'skykit') return 'SkyKit';
  return mode;
}

export function pointText(point) {
  return `${formatNumber(point?.x)} ${formatNumber(point?.y)} ${formatNumber(point?.z)}`;
}

export function formatNumber(value) {
  return Number(value ?? 0).toFixed(3).replace(/\.?0+$/u, '');
}

export function snapTime(value) {
  return Math.round((Number(value) || 0) / 0.05) * 0.05;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
}

export function syncCanvas(canvas) {
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
  const width = Math.max(1, canvas.clientWidth || 1);
  const height = Math.max(1, canvas.clientHeight || 1);
  const backingWidth = Math.max(1, Math.floor(width * pixelRatio));
  const backingHeight = Math.max(1, Math.floor(height * pixelRatio));
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  const context = canvas.getContext('2d');
  context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return { width, height, pixelRatio, context };
}

export function canvasPoint(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

export function vector3(point) {
  return new THREE.Vector3(Number(point?.x ?? 0), Number(point?.y ?? 0), Number(point?.z ?? 0));
}

export function widgetPoint(journey, type, id) {
  const widget = findWidget(journey, type, id);
  if (!widget) return null;
  if (type === 'camera') return widget.kind === 'target' ? widget.targetPc : null;
  return widget.positionPc;
}

export function findWidget(journey, type, id) {
  if (type === 'location') return journey.locationWaypoints?.find((entry) => entry.id === id) ?? null;
  if (type === 'camera') return journey.cameraLookWaypoints?.find((entry) => entry.id === id) ?? null;
  if (type === 'guide') return journey.guides?.find((entry) => entry.id === id) ?? null;
  return null;
}

export function isSelected(snapshot, type, id) {
  return snapshot.editorState.selectedWidget?.type === type && snapshot.editorState.selectedWidget.id === id;
}
