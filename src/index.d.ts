import type { TimedJourney } from './camera-timeline.js';

export declare const SKYKIT_STUDIO_PACKAGE_STATUS: 'alpha-editor';
export declare const DEFAULT_EDITOR_UNITS_PER_PARSEC: 3;
export declare const JOURNEY_VIDEO_EDITOR_TILE_MODES: readonly ['xy', 'xz', 'yz', 'perspective', 'preview', 'free-roam'];
export declare const JOURNEY_VIDEO_EDITOR_PANE_LAYOUT_PRESETS: readonly [
  'single',
  'two-stacked',
  'two-side-by-side',
  'three-primary-left',
  'three-primary-right',
  'four-grid'
];

export type JourneyVideoEditorTileMode = 'xy' | 'xz' | 'yz' | 'perspective' | 'preview' | 'free-roam';
export type JourneyVideoEditorPaneLayoutPreset =
  | 'single'
  | 'two-stacked'
  | 'two-side-by-side'
  | 'three-primary-left'
  | 'three-primary-right'
  | 'four-grid';
export type JourneyVideoEditorWidgetType = 'location' | 'camera' | 'guide';

export interface JourneyVideoEditorVector3 {
  x: number;
  y: number;
  z: number;
}

export interface JourneyVideoEditorQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface JourneyVideoEditorPose {
  observerPc: JourneyVideoEditorVector3;
  orientationIcrs: JourneyVideoEditorQuaternion;
}

export interface JourneyVideoEditorWidgetRef {
  type: JourneyVideoEditorWidgetType;
  id: string;
}

export interface JourneyVideoEditorLocationRangeRef {
  anchorId: string;
  focusId: string;
}

export interface JourneyVideoEditorPane {
  id: string;
  mode: JourneyVideoEditorTileMode;
}

export interface JourneyVideoEditorPaneLayout {
  preset: JourneyVideoEditorPaneLayoutPreset;
  paneIds: string[];
  primaryPaneId: string | null;
  previousLayout: JourneyVideoEditorPaneLayout | null;
}

export interface JourneyVideoEditorState {
  panes: JourneyVideoEditorPane[];
  paneLayout: JourneyVideoEditorPaneLayout;
  /** @deprecated Use panes instead. */
  tileModes: JourneyVideoEditorTileMode[];
  unitsPerParsec: number;
  /** @deprecated Use paneLayout instead. */
  expandedTileIndex: number | null;
  freeRoamPose: JourneyVideoEditorPose | null;
  selectedWidget: JourneyVideoEditorWidgetRef | null;
  selectedLocationRange: JourneyVideoEditorLocationRangeRef | null;
  selectedLocationGroupId: string | null;
  selectedLocationGroupPhase: 'start' | 'end' | null;
  easeSecs: number;
  timeSecs: number;
  playing: boolean;
}

export interface JourneyVideoEditorDocument {
  format: 'fis-journey-video-editor-v1';
  journey: TimedJourney;
  editorState: JourneyVideoEditorState;
  metadata: Record<string, unknown>;
}

export interface JourneyVideoStorage {
  load(): JourneyVideoEditorDocument | null;
  save(document: JourneyVideoEditorDocument): void;
  clear(): void;
}

export declare const DEFAULT_JOURNEY_VIDEO_EDITOR_STATE: Readonly<JourneyVideoEditorState>;
export declare function normalizeJourneyVideoEditorState(input?: unknown): JourneyVideoEditorState;
export declare function createJourneyVideoEditorDocument(options?: {
  journey?: unknown;
  editorState?: unknown;
  metadata?: Record<string, unknown>;
}): JourneyVideoEditorDocument;
export declare function exportJourneyVideoEditorDocument(document: JourneyVideoEditorDocument): string;
export declare function importJourneyVideoEditorDocument(input: string | unknown): JourneyVideoEditorDocument;
export declare function createJourneyVideoStorage(
  storage: { getItem?: Function; setItem?: Function; removeItem?: Function } | null | undefined,
  key?: string
): JourneyVideoStorage;
