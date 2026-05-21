// @ts-nocheck
import * as THREE from 'three';

const INDICATOR_SIZE = 96;
const AXIS_STYLES = Object.freeze({
  x: Object.freeze({ axis: 'x', label: '+X', color: '#ff6b6b' }),
  y: Object.freeze({ axis: 'y', label: '+Y', color: '#5be7a9' }),
  z: Object.freeze({ axis: 'z', label: '+Z', color: '#72d7ff' }),
});
const CAMERA_AXIS_VECTORS = Object.freeze({
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
});
const PLANE_AXIS_LAYOUTS = Object.freeze({
  xy: Object.freeze({
    axes: Object.freeze([
      arrowAxis('x', 1, 0),
      arrowAxis('y', 0, -1),
      perpendicularAxis('z', 'out'),
    ]),
  }),
  xz: Object.freeze({
    axes: Object.freeze([
      arrowAxis('x', 1, 0),
      arrowAxis('z', 0, -1),
      perpendicularAxis('y', 'in'),
    ]),
  }),
  yz: Object.freeze({
    axes: Object.freeze([
      arrowAxis('y', 1, 0),
      arrowAxis('z', 0, -1),
      perpendicularAxis('x', 'out'),
    ]),
  }),
});

/** @param {string} mode */
export function getPlaneAxisIndicatorLayout(mode) {
  return PLANE_AXIS_LAYOUTS[mode] ?? PLANE_AXIS_LAYOUTS.xy;
}

/** @param {THREE.Camera} camera */
export function projectCameraAxisIndicators(camera) {
  camera.updateMatrixWorld?.(true);
  const cameraQuaternion = new THREE.Quaternion();
  camera.getWorldQuaternion?.(cameraQuaternion);
  const viewQuaternion = cameraQuaternion.clone().invert();
  return ['x', 'y', 'z'].map((axis) => {
    const local = CAMERA_AXIS_VECTORS[axis].clone().applyQuaternion(viewQuaternion);
    const screen = { x: finiteNumber(local.x, 0), y: -finiteNumber(local.y, 0) };
    const screenLength = Math.hypot(screen.x, screen.y);
    const style = AXIS_STYLES[axis];
    return {
      kind: screenLength < 0.12 ? 'perpendicular' : 'arrow',
      axis,
      label: style.label,
      color: style.color,
      vector: screenLength > 1e-6
        ? { x: screen.x / screenLength, y: screen.y / screenLength }
        : { x: 0, y: 0 },
      direction: local.z > 0 ? 'out' : 'in',
      screenLength: finiteNumber(screenLength, 0),
      depth: finiteNumber(local.z, 0),
    };
  });
}

/** @param {Document} doc */
export function createAxisIndicatorOverlay(doc) {
  const canvas = doc.createElement('canvas');
  canvas.className = 'jve-axis-indicator';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = INDICATOR_SIZE;
  canvas.height = INDICATOR_SIZE;

  return {
    canvas,
    /** @param {string} mode */
    renderPlane(mode) {
      const target = syncIndicatorCanvas(canvas);
      if (!target.context) return;
      drawAxisIndicator(target.context, target.width, target.height, getPlaneAxisIndicatorLayout(mode).axes);
    },
    /** @param {THREE.Camera} camera */
    renderCamera(camera) {
      const target = syncIndicatorCanvas(canvas);
      if (!target.context) return;
      drawAxisIndicator(target.context, target.width, target.height, projectCameraAxisIndicators(camera));
    },
    dispose() {
      canvas.remove();
    },
  };
}

function arrowAxis(axis, x, y) {
  const style = AXIS_STYLES[axis];
  return Object.freeze({
    ...style,
    kind: 'arrow',
    vector: Object.freeze({ x, y }),
    screenLength: 1,
    depth: 0,
  });
}

function perpendicularAxis(axis, direction) {
  return Object.freeze({
    ...AXIS_STYLES[axis],
    kind: 'perpendicular',
    direction,
    vector: Object.freeze({ x: 0, y: 0 }),
    screenLength: 0,
    depth: direction === 'out' ? 1 : -1,
  });
}

/** @param {HTMLCanvasElement} canvas */
function syncIndicatorCanvas(canvas) {
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
  const width = Math.max(1, canvas.clientWidth || INDICATOR_SIZE);
  const height = Math.max(1, canvas.clientHeight || INDICATOR_SIZE);
  const backingWidth = Math.max(1, Math.floor(width * pixelRatio));
  const backingHeight = Math.max(1, Math.floor(height * pixelRatio));
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  const context = canvas.getContext('2d');
  context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context?.clearRect(0, 0, width, height);
  return { width, height, context };
}

function drawAxisIndicator(context, width, height, axes) {
  drawBackdrop(context, width, height);
  const size = Math.min(width, height);
  const origin = { x: width * 0.5, y: height * 0.56 };
  const length = size * 0.34;
  drawOrigin(context, origin.x, origin.y);
  for (const axis of axes.filter((entry) => entry.kind === 'arrow')) {
    const axisLength = length * (0.58 + Math.min(0.42, axis.screenLength));
    const end = {
      x: origin.x + axis.vector.x * axisLength,
      y: origin.y + axis.vector.y * axisLength,
    };
    drawArrow(context, origin.x, origin.y, end.x, end.y, axis.color);
    const label = clampLabelPoint(
      end.x + axis.vector.x * 7,
      end.y + axis.vector.y * 7,
      width,
      height,
    );
    drawAxisLabel(context, axis.label, label.x, label.y, axis.color);
  }
  for (const axis of axes.filter((entry) => entry.kind === 'perpendicular')) {
    drawDepthBadge(context, origin.x, origin.y, axis);
  }
}

function drawBackdrop(context, width, height) {
  context.save();
  context.fillStyle = 'rgba(2, 5, 11, 0.72)';
  context.strokeStyle = 'rgba(143, 213, 255, 0.2)';
  context.lineWidth = 1;
  roundedRect(context, 0.5, 0.5, width - 1, height - 1, 8);
  context.fill();
  context.stroke();
  context.restore();
}

function drawOrigin(context, x, y) {
  context.save();
  context.fillStyle = 'rgba(242, 246, 255, 0.82)';
  context.beginPath();
  context.arc(x, y, 3, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawArrow(context, startX, startY, endX, endY, color) {
  const angle = Math.atan2(endY - startY, endX - startX);
  const headLength = 7;
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();
  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(
    endX - Math.cos(angle - Math.PI / 6) * headLength,
    endY - Math.sin(angle - Math.PI / 6) * headLength,
  );
  context.lineTo(
    endX - Math.cos(angle + Math.PI / 6) * headLength,
    endY - Math.sin(angle + Math.PI / 6) * headLength,
  );
  context.closePath();
  context.fill();
  context.restore();
}

function drawAxisLabel(context, label, x, y, color) {
  context.save();
  context.font = '700 11px Inter, "Avenir Next", "Segoe UI", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 3;
  context.strokeStyle = 'rgba(2, 5, 11, 0.85)';
  context.fillStyle = color;
  context.strokeText(label, x, y);
  context.fillText(label, x, y);
  context.restore();
}

function drawDepthBadge(context, x, y, axis) {
  context.save();
  context.strokeStyle = axis.color;
  context.fillStyle = axis.color;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 8, 0, Math.PI * 2);
  context.stroke();
  if (axis.direction === 'out') {
    context.beginPath();
    context.arc(x, y, 2.5, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(x - 4, y - 4);
    context.lineTo(x + 4, y + 4);
    context.moveTo(x + 4, y - 4);
    context.lineTo(x - 4, y + 4);
    context.stroke();
  }
  drawAxisLabel(context, axis.label, x, y + 18, axis.color);
  context.restore();
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function clampLabelPoint(x, y, width, height) {
  return {
    x: Math.max(13, Math.min(width - 13, x)),
    y: Math.max(10, Math.min(height - 10, y)),
  };
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
