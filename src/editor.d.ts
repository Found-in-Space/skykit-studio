import type {
  TimedJourney,
  TimedJourneyFrame,
} from '@found-in-space/journey';
import type {
  JourneyVideoEditorDocument,
  JourneyVideoEditorState,
  JourneyVideoEditorPane,
  JourneyVideoEditorPaneLayout,
  JourneyVideoEditorPaneLayoutPreset,
  JourneyVideoEditorTileMode,
  JourneyVideoEditorWidgetRef,
  JourneyVideoEditorPose,
  JourneyVideoStorage,
} from './index.js';

export interface JourneyVideoStorageLike {
  getItem?: (key: string) => string | null;
  setItem?: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
}

export interface JourneyVideoEditorPreviewOptions {
  skykit?: boolean;
  octreeUrl?: string;
  /** Visual scale for the Three.js star-field object. Defaults to 1 and does not change world coordinates. */
  renderScale?: number;
  /** Single conversion from authored parsecs to SkyKit/Three render units. Defaults to 0.02. */
  coordinateUnitsPerParsec?: number;
  limitingMagnitude?: number;
  freeRoamSpeedPcPerSec?: number;
  freeRoamBoostMultiplier?: number;
  freeRoamLookSensitivity?: number;
  /** Persist fetched SkyKit star octree ranges in browser Cache Storage. Defaults to 'on' for the editor preview. */
  persistentCache?: 'on' | 'off';
}

export interface JourneyVideoEditorBrandOptions {
  title?: string;
  eyebrow?: string;
  markUrl?: string;
}

export interface CreateJourneyVideoEditorOptions {
  host?: Element | null;
  brand?: JourneyVideoEditorBrandOptions;
  document?: unknown;
  journey?: unknown;
  editorState?: unknown;
  storage?: JourneyVideoStorage | null;
  preview?: JourneyVideoEditorPreviewOptions;
  onChange?: (document: JourneyVideoEditorDocument) => void;
  onError?: (error: unknown) => void;
}

export interface JourneyVideoEditorSnapshot {
  disposed: boolean;
  journeyId: string;
  title: string;
  durationSecs: number;
  timeSecs: number;
  playing: boolean;
  panes: JourneyVideoEditorPane[];
  paneLayout: JourneyVideoEditorPaneLayout;
  /** @deprecated Use panes instead. */
  tileModes: JourneyVideoEditorTileMode[];
  /** @deprecated Use paneLayout instead. */
  expandedTileIndex: number | null;
  freeRoamPose: JourneyVideoEditorPose | null;
  selectedWidget: JourneyVideoEditorWidgetRef | null;
  selectedLocationRange: JourneyVideoEditorState['selectedLocationRange'];
  selectedLocationGroupId: string | null;
  selectedLocationGroupPhase: 'start' | 'end' | null;
  easeSecs: number;
  locationWaypointCount: number;
  cameraWaypointCount: number;
  guideCount: number;
}

export interface JourneyVideoEditor {
  setJourney(journey: unknown): void;
  getJourney(): TimedJourney;
  evaluateAt(timeSecs: number): TimedJourneyFrame;
  setTime(timeSecs: number): void;
  play(): void;
  pause(): void;
  /** @deprecated Use setPaneMode with a pane id instead. */
  setTileMode(index: number, mode: JourneyVideoEditorTileMode): void;
  /** @deprecated Use setPaneLayout('single', [paneId]) or setPaneLayout(...) instead. */
  setExpandedTileIndex(index: number | null): void;
  addPane(mode?: JourneyVideoEditorTileMode): string | null;
  removePane(paneId: string): void;
  setPaneMode(paneId: string, mode: JourneyVideoEditorTileMode): void;
  setPaneLayout(preset: JourneyVideoEditorPaneLayoutPreset, paneIds?: string[]): void;
  movePane(paneId: string, direction: 'previous' | 'next' | 'left' | 'right' | 'up' | 'down'): void;
  setUnitsPerParsec(unitsPerParsec: number): void;
  selectWidget(type: JourneyVideoEditorWidgetRef['type'], id: string): void;
  getSnapshot(): JourneyVideoEditorSnapshot;
  dispose(): Promise<void>;
}

export declare function createJourneyVideoEditor(
  options?: CreateJourneyVideoEditorOptions
): JourneyVideoEditor;
