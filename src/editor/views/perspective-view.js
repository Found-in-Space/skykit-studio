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
import { createAxisIndicatorOverlay } from '../axis-indicator.js';
import {
  isSelected,
  syncCanvas,
  vector3,
} from './shared.js';

export function createPerspectiveView() {
  let canvas = /** @type {HTMLCanvasElement | null} */ (null);
  let axisIndicator = null;
  let renderer = /** @type {THREE.WebGLRenderer | null} */ (null);
  let controls = /** @type {OrbitControls | null} */ (null);
  let snapshot = /** @type {import('../views.js').JourneyVideoEditorViewSnapshot | null} */ (null);
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
      axisIndicator = createAxisIndicatorOverlay(context.doc);
      context.body.append(axisIndicator.canvas);
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
      axisIndicator?.dispose();
      canvas?.remove();
      renderer = null;
      controls = null;
      axisIndicator = null;
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
    const perspectiveScale = Number(snapshot.editorState.unitsPerParsec ?? DEFAULT_EDITOR_UNITS_PER_PARSEC)
      / DEFAULT_EDITOR_UNITS_PER_PARSEC;
    const distance = Math.max(
      minDistance,
      scalarPcToRenderUnits(bounds.span, snapshot.world) / Math.max(0.2, perspectiveScale),
    );
    camera.position.copy(center).add(new THREE.Vector3(distance, distance * 0.6, distance));
    controls.target.copy(center);
    controls.update();
    addPerspectiveContent(root, snapshot);
    renderer.render(scene, camera);
    axisIndicator?.renderCamera(camera);
  }
}

/** @param {THREE.Group} root @param {import('../views.js').JourneyVideoEditorViewSnapshot} snapshot */
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
