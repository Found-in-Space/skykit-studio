// @ts-nocheck
import {
  createDurationView,
  createGuideFlowView,
  createStateSummaryView,
  createStatusView,
  createStorageView,
  createWaypointEditorView,
} from './views/panels.js';
import {
  createScaleView,
  createTimelineView,
  createTransportView,
} from './views/controls.js';
import { createPerspectiveView } from './views/perspective-view.js';
import { createProjectionView } from './views/projection-view.js';
import { createFreeRoamView } from './views/free-roam-view.js';
import { createSkykitView } from './views/skykit-view.js';
import { createJourneyVideoWorld } from '../world.js';

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
 *   services?: Record<string, unknown>;
 *   dispatch(action: Record<string, unknown>): void;
 *   reportError(error: unknown): void;
 * }} JourneyVideoEditorViewContext
 *
 * @typedef {{
 *   journey: Record<string, unknown>;
 *   editorState: Record<string, unknown>;
 *   evaluated: Record<string, unknown>;
 *   samples: Array<Record<string, unknown>>;
 *   cameraMarkers: Array<Record<string, unknown>>;
 *   projectionData: Record<string, unknown>;
 *   world: ReturnType<typeof createJourneyVideoWorld>;
 *   ui?: Record<string, unknown>;
 * }} JourneyVideoEditorViewSnapshot
 */

/** @param {string} mode */
export function createJourneyVideoEditorView(mode, options = {}) {
  if (mode === 'state-summary') return createStateSummaryView();
  if (mode === 'duration') return createDurationView();
  if (mode === 'storage') return createStorageView();
  if (mode === 'guide-flow') return createGuideFlowView();
  if (mode === 'waypoint-editor') return createWaypointEditorView();
  if (mode === 'status') return createStatusView();
  if (mode === 'scale') return createScaleView();
  if (mode === 'transport') return createTransportView();
  if (mode === 'timeline') return createTimelineView();
  if (mode === 'perspective') return createPerspectiveView();
  if (mode === 'preview' || mode === 'skykit') return createSkykitView();
  if (mode === 'free-roam') return createFreeRoamView();
  return createProjectionView(mode);
}
