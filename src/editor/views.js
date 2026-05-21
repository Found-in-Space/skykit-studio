// @ts-nocheck
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
 * }} JourneyVideoEditorViewSnapshot
 */

/** @param {string} mode */
export function createJourneyVideoEditorView(mode) {
  if (mode === 'perspective') return createPerspectiveView();
  if (mode === 'skykit') return createSkykitView();
  return createProjectionView(mode);
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
