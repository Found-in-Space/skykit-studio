// @ts-nocheck
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { DEFAULT_EDITOR_UNITS_PER_PARSEC } from '../../index.js';
import {
  createJourneyVideoGuideGroup,
  disposeObjectChildren,
  pointPcToRenderUnits,
  scalarPcToRenderUnits,
} from '../../world.js';
import {
  EDITOR_VIEW_STYLE,
  cameraWaypointStyle,
} from '../camera-waypoints.js';
import { createAxisIndicatorOverlay } from '../axis-indicator.js';
import {
  isSelected,
  syncCanvas,
  vector3,
} from './shared.js';

export function createPerspectiveView() {
  let context = /** @type {import('../views.js').JourneyVideoEditorViewContext | null} */ (null);
  let canvas = /** @type {HTMLCanvasElement | null} */ (null);
  let axisIndicator = null;
  let renderer = /** @type {THREE.WebGLRenderer | null} */ (null);
  let controls = /** @type {OrbitControls | null} */ (null);
  let snapshot = /** @type {import('../views.js').JourneyVideoEditorViewSnapshot | null} */ (null);
  let markerMeshes = [];
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.001, 100000);
  const root = new THREE.Group();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const viewDirection = new THREE.Vector3(1, 0.6, 1).normalize();
  let pointerDownPoint = null;
  let applyingCamera = false;
  scene.add(root);
  scene.background = new THREE.Color(0x02050b);

  return {
    mode: 'perspective',
    mount(nextContext) {
      context = nextContext;
      canvas = nextContext.doc.createElement('canvas');
      canvas.className = 'jve-tile-canvas';
      nextContext.body.append(canvas);
      axisIndicator = createAxisIndicatorOverlay(nextContext.doc);
      nextContext.body.append(axisIndicator.canvas);
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      controls = new OrbitControls(camera, canvas);
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.addEventListener('change', onControlsChange);
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('click', onClick);
    },
    update(nextSnapshot) {
      snapshot = nextSnapshot;
      renderSnapshot();
    },
    resize(size) {
      renderSnapshot(size);
    },
    dispose() {
      disposeObjectChildren(root);
      renderer?.dispose();
      controls?.removeEventListener?.('change', onControlsChange);
      controls?.dispose();
      canvas?.removeEventListener('pointerdown', onPointerDown);
      canvas?.removeEventListener('click', onClick);
      axisIndicator?.dispose();
      canvas?.remove();
      context = null;
      renderer = null;
      controls = null;
      axisIndicator = null;
      canvas = null;
      snapshot = null;
      markerMeshes = [];
    },
  };

  function renderSnapshot(size) {
    if (!canvas || !renderer || !controls || !snapshot) return;
    const { width, height, pixelRatio } = syncCanvas(canvas, size);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    disposeObjectChildren(root);
    const bounds = snapshot.projectionData.bounds;
    const center = vector3(pointPcToRenderUnits(snapshot.evaluated.observerPc, snapshot.world));
    const minDistance = Math.max(0.1, scalarPcToRenderUnits(30, snapshot.world));
    const perspectiveScale = Number(snapshot.editorState.unitsPerParsec ?? DEFAULT_EDITOR_UNITS_PER_PARSEC)
      / DEFAULT_EDITOR_UNITS_PER_PARSEC;
    const distance = Math.max(
      minDistance,
      scalarPcToRenderUnits(bounds.span, snapshot.world) / Math.max(0.2, perspectiveScale),
    );
    applyingCamera = true;
    camera.position.copy(center).add(viewDirection.clone().multiplyScalar(distance));
    controls.target.copy(center);
    controls.update();
    applyingCamera = false;
    markerMeshes = [];
    addPerspectiveContent(root, snapshot, markerMeshes);
    renderScene();
  }

  function onControlsChange() {
    if (!camera || !controls || applyingCamera) return;
    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() > 0) viewDirection.copy(offset.normalize());
    renderScene();
  }

  function renderScene() {
    if (!renderer) return;
    renderer.render(scene, camera);
    axisIndicator?.renderCamera(camera);
  }

  function onClick(event) {
    if (!canvas || !context || !snapshot) return;
    if (pointerDownPoint) {
      const distance = Math.hypot(event.clientX - pointerDownPoint.x, event.clientY - pointerDownPoint.y);
      pointerDownPoint = null;
      if (distance > 5) return;
    }
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(markerMeshes, true);
    const widget = hits.map((hit) => widgetFromObject(hit.object)).find(Boolean);
    if (!widget) return;
    context.dispatch({
      type: 'selectWidget',
      widgetType: widget.type,
      id: widget.id,
      extendRange: event.shiftKey,
    });
  }

  function onPointerDown(event) {
    pointerDownPoint = { x: event.clientX, y: event.clientY };
  }
}

/** @param {THREE.Group} root @param {import('../views.js').JourneyVideoEditorViewSnapshot} snapshot @param {THREE.Object3D[]} markerMeshes */
function addPerspectiveContent(root, snapshot, markerMeshes) {
  root.add(createPerspectiveLine(snapshot.samples.map((sample) => sample.observerPc), snapshot, EDITOR_VIEW_STYLE.colors.path, 0.95));
  const rangeSamples = selectedLocationRangeSamples(snapshot);
  if (rangeSamples.length >= 2) {
    root.add(createPerspectiveLine(rangeSamples.map((sample) => sample.observerPc), snapshot, EDITOR_VIEW_STYLE.colors.selectedPath, 1));
  }
  const guideGroup = createJourneyVideoGuideGroup(snapshot.journey, snapshot.world);
  for (const [index, child] of guideGroup.children.entries()) {
    const guide = snapshot.journey.guides?.[index];
    if (!guide) continue;
    child.userData.widget = { type: 'guide', id: guide.id };
    if (isSelected(snapshot, 'guide', guide.id)) child.scale.multiplyScalar(1.16);
    markerMeshes.push(child);
  }
  root.add(guideGroup);
  for (const waypoint of snapshot.journey.locationWaypoints ?? []) {
    const selected = isSelected(snapshot, 'location', waypoint.id);
    const helper = waypoint.motionGroup?.role === 'helper';
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.004, scalarPcToRenderUnits(helper ? 0.22 : 0.35, snapshot.world)), 16, 8),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(selected
          ? EDITOR_VIEW_STYLE.colors.selected
          : helper
            ? EDITOR_VIEW_STYLE.colors.locationHelper
            : EDITOR_VIEW_STYLE.colors.location),
      }),
    );
    mesh.position.copy(vector3(pointPcToRenderUnits(waypoint.positionPc, snapshot.world)));
    mesh.userData.widget = { type: 'location', id: waypoint.id };
    root.add(mesh);
    markerMeshes.push(mesh);
  }
  for (const marker of snapshot.cameraMarkers ?? []) {
    const mesh = createCameraWaypointMesh(marker, snapshot);
    mesh.userData.widget = { type: 'camera', id: marker.id };
    root.add(mesh);
    markerMeshes.push(mesh);
  }
  const current = createPerspectiveSphere(snapshot.evaluated.observerPc, 0.45, EDITOR_VIEW_STYLE.colors.currentObserver, 1, snapshot.world);
  root.add(current);
  const forward = vector3(snapshot.evaluated.cameraForwardPc).normalize();
  if (forward.lengthSq() > 0) {
    const bounds = snapshot.projectionData.bounds;
    const length = Math.max(
      scalarPcToRenderUnits(1, snapshot.world),
      Math.min(scalarPcToRenderUnits(bounds.span * 0.16, snapshot.world), scalarPcToRenderUnits(18, snapshot.world)),
    );
    root.add(new THREE.ArrowHelper(
      forward,
      vector3(pointPcToRenderUnits(snapshot.evaluated.observerPc, snapshot.world)),
      length,
      new THREE.Color(EDITOR_VIEW_STYLE.colors.cameraDirection).getHex(),
      length * 0.22,
      length * 0.1,
    ));
  }
}

function createCameraWaypointMesh(marker, snapshot) {
  const style = cameraWaypointStyle(marker.kind, isSelected(snapshot, 'camera', marker.id));
  const color = new THREE.Color(style.color);
  const scale = style.active ? 1.25 : 1;
  const radius = Math.max(0.004, scalarPcToRenderUnits(marker.kind === 'target' ? 0.55 : 0.45, snapshot.world));
  const material = new THREE.MeshBasicMaterial({
    color,
    wireframe: marker.kind === 'quaternion',
  });
  const mesh = marker.kind === 'target'
    ? new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.09, 8, 28), material)
    : marker.kind === 'quaternion'
      ? new THREE.Mesh(new THREE.TetrahedronGeometry(radius * 1.2), material)
      : new THREE.Mesh(new THREE.OctahedronGeometry(radius), material);
  mesh.scale.multiplyScalar(scale);
  mesh.position.copy(vector3(pointPcToRenderUnits(marker.pointPc, snapshot.world)));
  if (marker.kind === 'target') {
    mesh.lookAt(vector3(pointPcToRenderUnits(snapshot.evaluated.observerPc, snapshot.world)));
  }
  return mesh;
}

function createPerspectiveLine(pointsPc, snapshot, colorText, opacity = 1) {
  const points = pointsPc.map((point) => vector3(pointPcToRenderUnits(point, snapshot.world)));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(colorText),
    transparent: opacity < 1,
    opacity,
  });
  return new THREE.Line(geometry, material);
}

function createPerspectiveSphere(pointPc, radiusPc, colorText, opacity, world) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(0.004, scalarPcToRenderUnits(radiusPc, world)), 16, 8),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorText),
      transparent: opacity < 1,
      opacity,
    }),
  );
  mesh.position.copy(vector3(pointPcToRenderUnits(pointPc, world)));
  return mesh;
}

function selectedLocationRangeSamples(snapshot) {
  const range = snapshot.editorState.selectedLocationRange;
  if (!range) return [];
  const selected = (snapshot.journey.locationWaypoints ?? [])
    .filter((waypoint) => waypoint.id === range.anchorId || waypoint.id === range.focusId)
    .sort((left, right) => Number(left.timeSecs ?? 0) - Number(right.timeSecs ?? 0));
  if (selected.length !== 2) return [];
  const start = Number(selected[0].timeSecs ?? 0);
  const end = Number(selected[1].timeSecs ?? 0);
  return (snapshot.samples ?? []).filter((sample) => (
    Number(sample.sceneTimeSecs ?? 0) >= start && Number(sample.sceneTimeSecs ?? 0) <= end
  ));
}

function widgetFromObject(object) {
  let current = object;
  while (current) {
    if (current.userData?.widget) return current.userData.widget;
    current = current.parent;
  }
  return null;
}
