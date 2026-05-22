import type {
  TimedJourney,
  TimedJourneyFrame,
} from '@found-in-space/journey';
import type {
  JourneyVideoEditorDocument,
  JourneyVideoEditorState,
  JourneyVideoEditorTileMode,
  JourneyVideoEditorWidgetRef,
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
  tileModes: JourneyVideoEditorTileMode[];
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
  setTileMode(index: number, mode: JourneyVideoEditorTileMode): void;
  setUnitsPerParsec(unitsPerParsec: number): void;
  selectWidget(type: JourneyVideoEditorWidgetRef['type'], id: string): void;
  getSnapshot(): JourneyVideoEditorSnapshot;
  dispose(): Promise<void>;
}

export declare function createJourneyVideoEditor(
  options?: CreateJourneyVideoEditorOptions
): JourneyVideoEditor;
