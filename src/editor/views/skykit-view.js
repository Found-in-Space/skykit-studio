// @ts-nocheck
import * as THREE from 'three';

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
  createJourneyVideoWorld,
  disposeObjectChildren,
  syncJourneyVideoGuideGroup,
} from '../../world.js';
import { createAxisIndicatorOverlay } from '../axis-indicator.js';

export function createSkykitView() {
  let shell = /** @type {HTMLDivElement | null} */ (null);
  let axisIndicator = null;
  let disposed = false;
  let ready = false;
  let viewer = null;
  let loop = null;
  let provider = null;
  let renderer = null;
  let camera = null;
  let pendingSnapshot = /** @type {import('../views.js').JourneyVideoEditorViewSnapshot | null} */ (null);
  const guideGroup = new THREE.Group();
  guideGroup.name = 'journey-video-editor-guides';

  return {
    mode: 'skykit',
    mount(nextContext) {
      shell = nextContext.doc.createElement('div');
      shell.className = 'jve-skykit-tile';
      nextContext.body.append(shell);
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
          createSkykitAxisIndicatorPlugin(() => axisIndicator),
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
      axisIndicator?.dispose();
      shell?.remove();
      loop = null;
      viewer = null;
      provider = null;
      renderer = null;
      camera = null;
      axisIndicator = null;
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
    axisIndicator?.renderCamera(viewer.camera);
  }
}

function createSkykitAxisIndicatorPlugin(getAxisIndicator) {
  return {
    setup(context) {
      return context.addPart({
        id: 'journey-video-axis-indicator',
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
