// @ts-nocheck
import * as THREE from 'three';

import {
  createKeyboardNavigationPlugin,
  createMouseLookPlugin,
  createObject3dPlugin,
  createSkykitAnimationLoop,
  createSkykitStarPickingPlugin,
  createSkykitStarSourcePlugin,
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
  createJourneyVideoWorld,
  disposeObjectChildren,
  renderUnitsToPointPc,
  syncJourneyVideoGuideGroup,
} from '../../world.js';
import { createAxisIndicatorOverlay } from '../axis-indicator.js';
import { button, formatNumber } from './shared.js';

const FREE_ROAM_POSE_PERSIST_MS = 750;
const IDENTITY_QUATERNION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

export function createFreeRoamView() {
  let context = /** @type {import('../views.js').JourneyVideoEditorViewContext | null} */ (null);
  let shell = /** @type {HTMLDivElement | null} */ (null);
  let overlay = /** @type {HTMLDivElement | null} */ (null);
  let addPickedButton = /** @type {HTMLButtonElement | null} */ (null);
  let status = /** @type {HTMLParagraphElement | null} */ (null);
  let axisIndicator = null;
  let disposed = false;
  let ready = false;
  let initializedPose = false;
  let viewer = null;
  let loop = null;
  let provider = null;
  let renderer = null;
  let camera = null;
  let pickedStarTarget = null;
  let unsubscribeViewChange = null;
  let pendingSnapshot = /** @type {import('../views.js').JourneyVideoEditorViewSnapshot | null} */ (null);
  let pendingPick = /** @type {{ label: string; pointPc: { x: number; y: number; z: number } } | null} */ (null);
  let latestPose = /** @type {{ observerPc: { x: number; y: number; z: number }; orientationIcrs: { x: number; y: number; z: number; w: number } } | null} */ (null);
  let lastPersistedPose = null;
  let lastPersistedAt = 0;
  let persistTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
  const guideGroup = new THREE.Group();
  guideGroup.name = 'journey-video-free-roam-guides';

  return {
    mode: 'free-roam',
    mount(nextContext) {
      context = nextContext;
      shell = nextContext.doc.createElement('div');
      shell.className = 'jve-free-roam-tile';
      shell.tabIndex = 0;
      shell.addEventListener('pointerdown', focusShell);
      nextContext.body.append(shell);

      overlay = createOverlay(nextContext.doc);
      nextContext.body.append(overlay);
      axisIndicator = createAxisIndicatorOverlay(nextContext.doc);
      nextContext.body.append(axisIndicator.canvas);

      const world = nextContext.world ?? createJourneyVideoWorld(nextContext.preview);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      camera = new THREE.PerspectiveCamera(60, 1, 0.001, 10000);
      provider = createStarOctreeProviderService({
        url: String(nextContext.preview?.octreeUrl ?? OCTREE_DEFAULT),
        persistentCache: nextContext.preview?.persistentCache === 'off' ? 'off' : 'on',
      });
      const starField = createThreeStarField({
        renderScale: world.renderScale,
        limitingMagnitude: world.limitingMagnitude,
        coordinateUnitsPerParsec: world.coordinateUnitsPerParsec,
      });
      const source = createSkykitStarSourcePlugin({ provider });
      pickedStarTarget = createFreeRoamStarTarget(nextContext.doc);

      createSkykitViewer({
        host: shell,
        renderer,
        camera,
        view: {
          coordinateUnitsPerParsec: world.coordinateUnitsPerParsec,
          limitingMagnitude: world.limitingMagnitude,
        },
        plugins: [
          source,
          createStreamingStarsPlugin({
            id: 'free-roam-stars',
            source,
            renderer: starField,
            strategy: createObserverShellStrategy(),
            attributes: ['position'],
          }),
          createObject3dPlugin({
            id: 'free-roam-guides',
            object3d: guideGroup,
            anchorMode: 'world-space',
          }),
          createObject3dPlugin({
            id: 'free-roam-picked-star-target',
            object3d: pickedStarTarget.object3d,
            anchorMode: 'world-space',
          }),
          createKeyboardNavigationPlugin({
            target: shell,
            speedPcPerSec: positiveNumber(nextContext.preview?.freeRoamSpeedPcPerSec, 2),
            boostMultiplier: positiveNumber(nextContext.preview?.freeRoamBoostMultiplier, 10),
            verticalMode: 'view',
          }),
          createMouseLookPlugin({
            target: shell,
            sensitivityRadiansPerPixel: positiveNumber(nextContext.preview?.freeRoamLookSensitivity, 0.00075),
          }),
          createSkykitStarPickingPlugin({
            target: shell,
            source,
            renderer: starField,
            onPick(event) {
              const pointPc = renderUnitsToPointPc(event.pick.position, world);
              pendingPick = {
                label: String(event.label || 'Picked star'),
                pointPc,
              };
              pickedStarTarget?.setPosition(event.pick.position);
              updateOverlay();
            },
          }),
          createFreeRoamAxisIndicatorPlugin(() => axisIndicator),
        ],
      }).then((created) => {
        if (disposed) {
          void created.dispose();
          return;
        }
        viewer = created;
        unsubscribeViewChange = viewer.on('view/change', onViewChange);
        loop = createSkykitAnimationLoop(viewer, { render: true });
        loop.start();
        ready = true;
        applySnapshot();
      }).catch((error) => nextContext.reportError(error));
    },
    update(snapshot) {
      pendingSnapshot = snapshot;
      if (ready) applySnapshot();
    },
    resize(size) {
      viewer?.resize?.(normalizeViewportSize(size));
    },
    async dispose() {
      disposed = true;
      flushPersistedPose();
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = null;
      ready = false;
      loop?.dispose?.();
      unsubscribeViewChange?.();
      await viewer?.dispose?.();
      provider?.dispose?.();
      pickedStarTarget?.dispose();
      renderer?.dispose?.();
      disposeObjectChildren(guideGroup);
      shell?.removeEventListener('pointerdown', focusShell);
      axisIndicator?.dispose();
      shell?.remove();
      overlay?.remove();
      loop = null;
      viewer = null;
      provider = null;
      renderer = null;
      camera = null;
      pickedStarTarget = null;
      axisIndicator = null;
      shell = null;
      overlay = null;
      addPickedButton = null;
      status = null;
      context = null;
      pendingSnapshot = null;
      pendingPick = null;
    },
  };

  function createOverlay(doc) {
    const root = doc.createElement('div');
    root.className = 'jve-free-roam-overlay';
    const dropButton = button(doc, 'Drop Here', () => {
      if (!viewer || !context) return;
      const view = viewer.getViewState();
      context.dispatch({
        type: 'addGuideAt',
        pointPc: view.observerPc,
      });
    }, 'jve-free-roam-button');
    addPickedButton = button(doc, 'Add Picked Star', () => {
      if (!context || !pendingPick) return;
      context.dispatch({
        type: 'addGuideAt',
        pointPc: pendingPick.pointPc,
        label: pendingPick.label,
      });
      pendingPick = null;
      pickedStarTarget?.clear();
      updateOverlay();
    }, 'jve-free-roam-button');
    status = doc.createElement('p');
    status.className = 'jve-free-roam-status';
    root.append(dropButton, addPickedButton, status);
    updateOverlay();
    return root;
  }

  function applySnapshot() {
    if (!viewer || !pendingSnapshot) return;
    syncJourneyVideoGuideGroup(guideGroup, pendingSnapshot.journey, pendingSnapshot.world);
    const patch = {
      limitingMagnitude: pendingSnapshot.world.limitingMagnitude,
    };
    if (!initializedPose) {
      Object.assign(patch, initialPose(pendingSnapshot));
      initializedPose = true;
    }
    viewer.requestViewState(patch, 'journey-video-free-roam');
    viewer.resize();
    axisIndicator?.renderCamera(viewer.camera);
  }

  function initialPose(snapshot) {
    const saved = snapshot.editorState.freeRoamPose;
    return {
      observerPc: clonePoint(saved?.observerPc ?? snapshot.evaluated.observerPc),
      orientationIcrs: cloneQuaternion(
        saved?.orientationIcrs
          ?? snapshot.evaluated.orientationIcrs
          ?? snapshot.evaluated.cameraQuaternion
          ?? IDENTITY_QUATERNION,
      ),
    };
  }

  function onViewChange(event) {
    latestPose = {
      observerPc: clonePoint(event.view?.observerPc),
      orientationIcrs: cloneQuaternion(event.view?.orientationIcrs ?? IDENTITY_QUATERNION),
    };
    schedulePosePersist();
  }

  function schedulePosePersist() {
    if (!latestPose) return;
    const now = performance.now();
    const elapsed = now - lastPersistedAt;
    if (elapsed >= FREE_ROAM_POSE_PERSIST_MS) {
      flushPersistedPose();
      return;
    }
    if (!persistTimer) {
      persistTimer = setTimeout(() => {
        persistTimer = null;
        flushPersistedPose();
      }, Math.max(0, FREE_ROAM_POSE_PERSIST_MS - elapsed));
    }
  }

  function flushPersistedPose() {
    if (!context || !latestPose || samePose(latestPose, lastPersistedPose)) return;
    lastPersistedPose = clonePose(latestPose);
    lastPersistedAt = performance.now();
    context.dispatch({
      type: 'setFreeRoamPose',
      pose: lastPersistedPose,
    });
  }

  function updateOverlay() {
    if (addPickedButton) addPickedButton.disabled = !pendingPick;
    if (status) {
      status.textContent = pendingPick
        ? `Picked ${pendingPick.label} (${formatNumber(pendingPick.pointPc.x)}, ${formatNumber(pendingPick.pointPc.y)}, ${formatNumber(pendingPick.pointPc.z)})`
        : '';
      status.toggleAttribute('hidden', !pendingPick);
    }
  }

  function focusShell() {
    shell?.focus?.({ preventScroll: true });
  }
}

function normalizeViewportSize(size = {}) {
  if (!size || size.width === undefined || size.height === undefined) return undefined;
  return {
    width: Math.max(1, Number(size.width) || 1),
    height: Math.max(1, Number(size.height) || 1),
    devicePixelRatio: Math.min(Number(size.devicePixelRatio ?? globalThis.devicePixelRatio) || 1, 2),
  };
}

function createFreeRoamAxisIndicatorPlugin(getAxisIndicator) {
  return {
    setup(context) {
      return context.addPart({
        id: 'journey-video-free-roam-axis-indicator',
        priority: 10000,
        afterRender(frame) {
          getAxisIndicator()?.renderCamera(frame.camera);
        },
        resize() {
          getAxisIndicator()?.renderCamera(context.camera);
        },
      });
    },
  };
}

function createFreeRoamStarTarget(doc) {
  const canvas = doc.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(64, 64);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.96)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-56, 0);
    ctx.lineTo(-42, 0);
    ctx.moveTo(42, 0);
    ctx.lineTo(56, 0);
    ctx.moveTo(0, -56);
    ctx.lineTo(0, -42);
    ctx.moveTo(0, 42);
    ctx.lineTo(0, 56);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 209, 102, 0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
  });
  const object3d = new THREE.Sprite(material);
  object3d.name = 'journey-video-free-roam-picked-star-target';
  object3d.visible = false;
  object3d.renderOrder = 10000;
  object3d.scale.setScalar(0.085);
  return {
    object3d,
    setPosition(position) {
      object3d.position.set(
        finiteNumber(position?.x, 0),
        finiteNumber(position?.y, 0),
        finiteNumber(position?.z, 0),
      );
      object3d.visible = true;
    },
    clear() {
      object3d.visible = false;
    },
    dispose() {
      object3d.parent?.remove(object3d);
      texture.dispose();
      material.dispose();
    },
  };
}

function clonePose(pose) {
  return {
    observerPc: clonePoint(pose?.observerPc),
    orientationIcrs: cloneQuaternion(pose?.orientationIcrs),
  };
}

function samePose(left, right) {
  if (!left || !right) return false;
  return samePoint(left.observerPc, right.observerPc)
    && samePoint(left.orientationIcrs, right.orientationIcrs, 1e-8)
    && Math.abs(Number(left.orientationIcrs?.w ?? 1) - Number(right.orientationIcrs?.w ?? 1)) < 1e-8;
}

function samePoint(left, right, epsilon = 1e-6) {
  if (!left || !right) return false;
  return Math.abs(Number(left.x ?? 0) - Number(right.x ?? 0)) < epsilon
    && Math.abs(Number(left.y ?? 0) - Number(right.y ?? 0)) < epsilon
    && Math.abs(Number(left.z ?? 0) - Number(right.z ?? 0)) < epsilon;
}

function clonePoint(point) {
  return {
    x: finiteNumber(point?.x, 0),
    y: finiteNumber(point?.y, 0),
    z: finiteNumber(point?.z, 0),
  };
}

function cloneQuaternion(quaternion) {
  return {
    x: finiteNumber(quaternion?.x, 0),
    y: finiteNumber(quaternion?.y, 0),
    z: finiteNumber(quaternion?.z, 0),
    w: finiteNumber(quaternion?.w, 1),
  };
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
