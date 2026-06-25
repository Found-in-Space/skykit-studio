import type {
  SpatialPreloadHint,
  SpatialQuaternion,
  SpatialVector3,
} from '@found-in-space/spatial';

export declare const FIS_JOURNEY_FORMAT: 'fis-journey-v1';

export interface TimedJourneyLocationWaypoint {
  id: string;
  timeSecs: number;
  positionPc: SpatialVector3;
  motionGroup?: Record<string, unknown>;
}

export type TimedJourneyCameraLookWaypoint =
  | {
      id: string;
      timeSecs: number;
      kind: 'direction';
      forward: SpatialVector3;
      up: SpatialVector3;
    }
  | {
      id: string;
      timeSecs: number;
      kind: 'target';
      targetPc: SpatialVector3;
      up: SpatialVector3;
      targetGuide?: Record<string, unknown>;
    }
  | {
      id: string;
      timeSecs: number;
      kind: 'quaternion';
      orientation: SpatialQuaternion;
    };

export interface TimedJourneyCue {
  id: string;
  startSecs: number;
  endSecs: number;
  [key: string]: unknown;
}

export interface TimedJourneyGuide {
  id: string;
  label: string;
  [key: string]: unknown;
}

export interface TimedJourneyTrackKeyframe {
  timeSecs: number;
  value: unknown;
}

export interface TimedJourneyTrack {
  id: string;
  interpolation: 'hold' | 'linear' | 'smoothstep';
  keyframes: TimedJourneyTrackKeyframe[];
}

export interface TimedJourney {
  format: string;
  id: string;
  title: string;
  durationSecs: number;
  targetDistancePc: number;
  locationWaypoints: TimedJourneyLocationWaypoint[];
  cameraLookWaypoints: TimedJourneyCameraLookWaypoint[];
  cues: TimedJourneyCue[];
  guides: TimedJourneyGuide[];
  tracks: Record<string, TimedJourneyTrack>;
}

export interface CreateTimedJourneyEvaluatorOptions {
  samplesPerSegment?: number;
  useLinearInterpolation?: boolean;
  targetDistancePc?: number;
  cueFadeSecs?: number;
  preloadStepSecs?: number;
  pathRadiusPc?: number;
  sphereRadiusPc?: number;
  lookaheadSecs?: number;
}

export interface TimedJourneyFrame {
  sceneTimeSecs: number;
  observerPc: SpatialVector3;
  orientationIcrs: SpatialQuaternion;
  cameraQuaternion: SpatialQuaternion;
  targetPc: SpatialVector3;
  cameraForwardPc: SpatialVector3;
  cameraUpPc: SpatialVector3;
  velocityPcPerSec: SpatialVector3;
  velocityUnitVectorPc: SpatialVector3;
  speedPcPerSec: number;
  cue: TimedJourneyCue | null;
  cueOpacity: number;
  tracks: Record<string, unknown>;
  preloadHints: SpatialPreloadHint[];
}

export interface TimedJourneyEvaluator {
  journey: TimedJourney;
  durationSecs: number;
  evaluate(sceneTimeSecs: number): TimedJourneyFrame;
  sample(options?: { stepSecs?: number }): TimedJourneyFrame[];
  getCueAt(timeSecs: number): TimedJourneyCue | null;
  getCueOpacity(timeSecs: number, fadeSecs?: number): number;
  getPreloadHints(): SpatialPreloadHint[];
}

export interface JourneyLocationRangeSpeedStats {
  startId: string;
  endId: string;
  startTimeSecs: number;
  endTimeSecs: number;
  durationSecs: number;
  waypointCount: number;
  segmentCount: number;
  totalLengthPc: number;
  averageSpeedPcPerSec: number;
  minSpeedPcPerSec: number;
  maxSpeedPcPerSec: number;
  movingSegmentCount: number;
  holdSegmentCount: number;
  segments: Array<{
    index: number;
    startId: string;
    endId: string;
    startTimeSecs: number;
    endTimeSecs: number;
    durationSecs: number;
    lengthPc: number;
    held: boolean;
    speedPcPerSec: number;
  }>;
}

export interface JourneyLocationArcSegment {
  index: number;
  startId: string;
  endId: string;
  startTimeSecs: number;
  endTimeSecs: number;
  durationSecs: number;
  lengthPc: number;
  held: boolean;
  speedPcPerSec: number;
}

export interface JourneyRetimingResult {
  locationWaypoints: TimedJourneyLocationWaypoint[];
  before: JourneyLocationRangeSpeedStats | null;
  after: JourneyLocationRangeSpeedStats | null;
  changedIds: string[];
  insertedIds: string[];
  insertedCount: number;
  effectiveEaseSecs?: number;
  groupId?: string;
  startGroupId?: string;
  endGroupId?: string;
  groupIds?: string[];
}

export interface TimedJourneyRetimingResult extends JourneyRetimingResult {
  journey: TimedJourney;
}

export interface DeleteJourneyEaseLocationGroupResult {
  locationWaypoints: TimedJourneyLocationWaypoint[];
  deletedIds: string[];
  clearedIds: string[];
}

export interface DeleteTimedJourneyEaseLocationGroupResult extends DeleteJourneyEaseLocationGroupResult {
  journey: TimedJourney;
}

export interface TimedJourneyRangeOptions {
  anchorId: string;
  focusId: string;
  timeStepSecs?: number;
  samplesPerSegment?: number;
}

export interface TimedJourneyEaseRangeOptions extends TimedJourneyRangeOptions {
  easeSecs?: number;
  rampSampleSecs?: number;
  groupId?: string;
  startGroupId?: string;
  endGroupId?: string;
  phase?: 'start' | 'end';
  phases?: Iterable<'start' | 'end'>;
}

export interface JourneyEaseLocationRangeOptions {
  easeSecs?: number;
  rampSampleSecs?: number;
  timeStepSecs?: number;
  samplesPerSegment?: number;
  groupId?: string;
  startGroupId?: string;
  endGroupId?: string;
  phase?: 'start' | 'end';
  phases?: Iterable<'start' | 'end'>;
}

export declare function normalizeTimedJourney(journeyInput?: unknown): TimedJourney;
export declare function createTimedJourneyEvaluator(
  journeyInput: unknown,
  options?: CreateTimedJourneyEvaluatorOptions
): TimedJourneyEvaluator;
export declare function evaluateTimedJourneyAtTime(
  journeyInput: unknown,
  sceneTimeSecs: number,
  options?: CreateTimedJourneyEvaluatorOptions
): TimedJourneyFrame;
export declare function getTimedJourneyCueAt(journey: TimedJourney, timeSecs: number): TimedJourneyCue | null;
export declare function getTimedJourneyCueOpacity(cue: TimedJourneyCue, timeSecs: number, fadeSecs?: number): number;
export declare function getJourneyLocationRangeSpeedStats(
  locationWaypoints: Iterable<unknown>,
  anchorId: string,
  focusId: string,
  options?: { samplesPerSegment?: number }
): JourneyLocationRangeSpeedStats | null;
export declare function getJourneyLocationArcSegments(
  locationWaypoints: Iterable<unknown>,
  options?: { samplesPerSegment?: number }
): JourneyLocationArcSegment[];
export declare function sampleJourneyLocationArcPoint(
  locationWaypoints: Iterable<unknown>,
  segmentIndex: number,
  distancePc: number,
  options?: { samplesPerSegment?: number }
): SpatialVector3;
export declare function equalizeJourneyLocationRangeSpeeds(
  locationWaypoints: Iterable<unknown>,
  anchorId: string,
  focusId: string,
  options?: { samplesPerSegment?: number; timeStepSecs?: number }
): JourneyRetimingResult;
export declare function easeJourneyLocationRangeStartEnd(
  locationWaypoints: Iterable<unknown>,
  anchorId: string,
  focusId: string,
  options?: JourneyEaseLocationRangeOptions
): JourneyRetimingResult;
export declare function deleteJourneyEaseLocationGroupHelpers(
  locationWaypoints: Iterable<unknown>,
  groupId: string,
  options?: { phase?: string }
): DeleteJourneyEaseLocationGroupResult;
export declare function rebuildJourneyEaseLocationGroup(
  locationWaypoints: Iterable<unknown>,
  groupId: string,
  options?: { easeSecs?: number; rampSampleSecs?: number; timeStepSecs?: number; samplesPerSegment?: number; phase?: string }
): JourneyRetimingResult;
export declare function equalizeTimedJourneyLocationRangeSpeed(
  journey: unknown,
  options: TimedJourneyRangeOptions
): TimedJourneyRetimingResult;
export declare function easeTimedJourneyLocationRange(
  journey: unknown,
  options: TimedJourneyEaseRangeOptions
): TimedJourneyRetimingResult;
export declare function deleteTimedJourneyEaseGroup(
  journey: unknown,
  groupId: string,
  options?: { phase?: 'start' | 'end' }
): DeleteTimedJourneyEaseLocationGroupResult;
export declare function rebuildTimedJourneyEaseGroup(
  journey: unknown,
  groupId: string,
  options?: {
    easeSecs?: number;
    rampSampleSecs?: number;
    timeStepSecs?: number;
    samplesPerSegment?: number;
    phase?: 'start' | 'end';
  }
): TimedJourneyRetimingResult;
