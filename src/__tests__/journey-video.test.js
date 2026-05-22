import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTimedJourneyEvaluator,
  normalizeTimedJourney,
} from '@found-in-space/journey';
import {
  easeTimedJourneyLocationRange,
  equalizeTimedJourneyLocationRangeSpeed,
} from '@found-in-space/journey/authoring';
import * as THREE from 'three';

import { createJourneyVideoEditor } from '../editor.js';
import {
  DEFAULT_EDITOR_UNITS_PER_PARSEC,
  JOURNEY_VIDEO_PACKAGE_STATUS,
  createJourneyVideoEditorDocument,
  exportJourneyVideoEditorDocument,
  importJourneyVideoEditorDocument,
  normalizeJourneyVideoEditorState,
} from '../index.js';
import {
  buildJourneyVideoFfmpegArgs,
  buildJourneyVideoFfmpegFilter,
  computeJourneyVideoOverlayOpacity,
  createJourneyVideoOverlayBlocks,
  createJourneyVideoRenderMetadata,
  normalizeJourneyVideoLayout,
  normalizeJourneyVideoRenderProfile,
} from '../export.js';
import { normalizeJourneyVideoCliOptions } from '../export-node.js';
import {
  getPlaneAxisIndicatorLayout,
  projectCameraAxisIndicators,
} from '../editor/axis-indicator.js';
import {
  createJourneyEditorProjectionData,
  createJourneyProjectionTransform,
  hitJourneyEditorMarker,
  projectJourneyEditorPoint,
  unprojectJourneyEditorPoint,
} from '../editor/projection.js';
import {
  createCameraWaypointForFrame,
  createCameraWaypointMarkers,
  cameraWaypointStyle,
  patchCameraWaypoint,
} from '../editor/camera-waypoints.js';

const SAMPLE_JOURNEY = {
  format: 'fis-journey-v1',
  id: 'editor-test',
  title: 'Editor Test',
  durationSecs: 10,
  locationWaypoints: [
    { id: 'loc-a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
    { id: 'loc-b', timeSecs: 10, positionPc: { x: 10, y: 0, z: 0 } },
  ],
  cameraLookWaypoints: [
    { id: 'cam-a', timeSecs: 0, kind: 'target', targetPc: { x: 0, y: 0, z: -10 } },
    { id: 'cam-b', timeSecs: 10, kind: 'target', targetPc: { x: 10, y: 0, z: -10 } },
  ],
  guides: [
    {
      id: 'guide-a',
      label: 'Guide A',
      positionPc: { x: 5, y: 0, z: -2 },
      shape: 'sphere',
      radiusPc: 2,
    },
  ],
};

test('journey-video package exposes alpha editor status', () => {
  assert.equal(JOURNEY_VIDEO_PACKAGE_STATUS, 'alpha-editor');
});

test('editor state normalization preserves safe tile, scale, selection, and draft defaults', () => {
  const state = normalizeJourneyVideoEditorState({
    tileModes: ['yz', 'skykit', 'bad-mode'],
    unitsPerParsec: 200,
    selectedWidget: { type: 'guide', id: 'guide-a' },
    selectedLocationRange: { anchorId: 'loc-a', focusId: 'loc-b' },
    easeSecs: 4.5,
    timeSecs: 3.25,
    playing: true,
  });

  assert.deepEqual(state.tileModes, ['yz', 'skykit', 'perspective', 'skykit']);
  assert.equal(state.unitsPerParsec, 80);
  assert.deepEqual(state.selectedWidget, { type: 'guide', id: 'guide-a' });
  assert.deepEqual(state.selectedLocationRange, { anchorId: 'loc-a', focusId: 'loc-b' });
  assert.equal(state.easeSecs, 4.5);
  assert.equal(state.timeSecs, 3.25);
  assert.equal(state.playing, true);
  assert.equal(normalizeJourneyVideoEditorState({ zoom: 25 }).unitsPerParsec, DEFAULT_EDITOR_UNITS_PER_PARSEC);
  assert.equal(normalizeJourneyVideoEditorState({ easeSecs: -10 }).easeSecs, 0.05);
});

test('editor documents import and export fis journey data without website fields', () => {
  const document = createJourneyVideoEditorDocument({
    journey: SAMPLE_JOURNEY,
    editorState: { tileModes: ['xy', 'xz', 'yz', 'perspective'], unitsPerParsec: 2 },
    metadata: { source: 'test' },
  });
  const exported = exportJourneyVideoEditorDocument(document);
  const imported = importJourneyVideoEditorDocument(exported);

  assert.equal(imported.format, 'fis-journey-video-editor-v1');
  assert.equal(imported.journey.format, 'fis-journey-v1');
  assert.equal(imported.journey.id, 'editor-test');
  assert.equal(imported.editorState.unitsPerParsec, 2);
  assert.equal(imported.metadata.source, 'test');

  const rawJourney = importJourneyVideoEditorDocument(JSON.stringify(SAMPLE_JOURNEY));
  assert.equal(rawJourney.journey.id, 'editor-test');
});

test('journey authoring retiming tools produce editor-friendly timed journeys', () => {
  const journey = {
    ...SAMPLE_JOURNEY,
    locationWaypoints: [
      { id: 'loc-a', timeSecs: 0, positionPc: { x: 0, y: 0, z: 0 } },
      { id: 'loc-hold', timeSecs: 2, positionPc: { x: 0, y: 0, z: 0 } },
      { id: 'loc-b', timeSecs: 5, positionPc: { x: 1, y: 0, z: 0 } },
      { id: 'loc-c', timeSecs: 10, positionPc: { x: 10, y: 0, z: 0 } },
    ],
  };
  const equalized = equalizeTimedJourneyLocationRangeSpeed(journey, {
    anchorId: 'loc-a',
    focusId: 'loc-c',
    timeStepSecs: 0.05,
  });
  const eased = easeTimedJourneyLocationRange(journey, {
    anchorId: 'loc-a',
    focusId: 'loc-c',
    easeSecs: 2,
    rampSampleSecs: 1,
    timeStepSecs: 0.05,
  });

  assert.equal(equalized.journey.locationWaypoints.find((waypoint) => waypoint.id === 'loc-hold')?.timeSecs, 2);
  assert.equal(equalized.journey.locationWaypoints.find((waypoint) => waypoint.id === 'loc-b')?.timeSecs, 2.8);
  assert.ok(eased.startGroupId);
  assert.ok(eased.endGroupId);
  assert.notEqual(eased.startGroupId, eased.endGroupId);
  assert.equal(eased.journey.locationWaypoints.some((waypoint) => waypoint.motionGroup?.role === 'helper'), true);
});

test('projection helpers map journey widgets into stable tile coordinates and hit tests', () => {
  const data = createJourneyEditorProjectionData(SAMPLE_JOURNEY, { sampleStepSecs: 5 });
  const transform = createJourneyProjectionTransform({
    mode: 'xz',
    width: 400,
    height: 300,
    unitsPerParsec: 3,
  });
  const projected = projectJourneyEditorPoint({ x: 5, y: 0, z: -2 }, transform);
  const hit = hitJourneyEditorMarker([
    { type: 'guide', id: 'guide-a', x: projected.x, y: projected.y, radius: 8 },
  ], projected.x + 2, projected.y + 1);

  assert.equal(data.samples.length, 3);
  assert.equal(transform.mode, 'xz');
  assert.ok(Number.isFinite(projected.x));
  assert.equal(hit?.id, 'guide-a');
  assert.equal(hitJourneyEditorMarker([
    { type: 'guide', id: 'guide-a', x: projected.x, y: projected.y, radius: 12 },
    { type: 'camera', id: 'cam-a', x: projected.x, y: projected.y, radius: 12 },
  ], projected.x, projected.y)?.id, 'cam-a');
});

test('projection views share explicit units per parsec', () => {
  const sharedOptions = {
    width: 400,
    height: 300,
    unitsPerParsec: 5.55,
  };
  const xy = createJourneyProjectionTransform({ ...sharedOptions, mode: 'xy' });
  const xz = createJourneyProjectionTransform({ ...sharedOptions, mode: 'xz' });
  const yz = createJourneyProjectionTransform({ ...sharedOptions, mode: 'yz' });
  const guide = SAMPLE_JOURNEY.guides[0];
  const projected = projectJourneyEditorPoint(guide.positionPc, xz);
  const roundTrip = unprojectJourneyEditorPoint(projected, xz, guide.positionPc);

  assert.equal(xy.unitsPerParsec, xz.unitsPerParsec);
  assert.equal(xz.unitsPerParsec, yz.unitsPerParsec);
  assert.equal(guide.radiusPc * xy.unitsPerParsec, guide.radiusPc * xz.unitsPerParsec);
  assert.ok(Math.abs(roundTrip.x - guide.positionPc.x) < 1e-9);
  assert.ok(Math.abs(roundTrip.y - guide.positionPc.y) < 1e-9);
  assert.ok(Math.abs(roundTrip.z - guide.positionPc.z) < 1e-9);
});

test('camera waypoint markers derive stable positions for target, direction, and quaternion keys', () => {
  const journey = normalizeTimedJourney({
    ...SAMPLE_JOURNEY,
    cameraLookWaypoints: [
      { id: 'cam-target', timeSecs: 0, kind: 'target', targetPc: { x: 1, y: 2, z: 3 } },
      { id: 'cam-direction', timeSecs: 5, kind: 'direction', forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } },
      { id: 'cam-quaternion', timeSecs: 10, kind: 'quaternion', orientation: { x: 0, y: 0, z: 0, w: 1 } },
    ],
  });
  const evaluator = createTimedJourneyEvaluator(journey);
  const markers = createCameraWaypointMarkers(journey, evaluator);
  const transform = createJourneyProjectionTransform({
    mode: 'xz',
    width: 400,
    height: 300,
    unitsPerParsec: 3,
  });

  assert.deepEqual(markers.map((marker) => marker.kind), ['target', 'direction', 'quaternion']);
  assert.deepEqual(markers.find((marker) => marker.id === 'cam-target')?.pointPc, { x: 1, y: 2, z: 3 });
  assert.deepEqual(markers.find((marker) => marker.id === 'cam-direction')?.pointPc, evaluator.evaluate(5).observerPc);
  assert.deepEqual(markers.find((marker) => marker.id === 'cam-quaternion')?.pointPc, evaluator.evaluate(10).observerPc);
  for (const marker of markers) {
    const projected = projectJourneyEditorPoint(marker.pointPc, transform);
    assert.equal(Number.isFinite(projected.x), true);
    assert.equal(Number.isFinite(projected.y), true);
  }
});

test('camera waypoint helpers seed and patch the current timed camera model', () => {
  const frame = {
    sceneTimeSecs: 4,
    targetPc: { x: 5, y: 6, z: 7 },
    cameraForwardPc: { x: 0.1, y: 0.2, z: -0.9 },
    cameraUpPc: { x: 0, y: 1, z: 0 },
    orientationIcrs: { x: 0.2, y: 0.3, z: 0.4, w: 0.8 },
  };
  const added = createCameraWaypointForFrame('cam-new', 4, frame);
  const asTarget = patchCameraWaypoint(added, { kind: 'target' }, frame);
  const asQuaternion = patchCameraWaypoint(asTarget, { kind: 'quaternion' }, frame);
  const asDirection = patchCameraWaypoint(asQuaternion, {
    kind: 'direction',
    forward: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 0, z: 1 },
  }, frame);
  const guideTarget = patchCameraWaypoint({ ...asTarget, id: 'cam-guide' }, {
    targetPc: SAMPLE_JOURNEY.guides[0].positionPc,
    targetGuide: { id: 'guide-a', label: 'Guide A' },
  }, frame);
  const manualTarget = patchCameraWaypoint(guideTarget, {
    targetPc: { x: 9, y: 8, z: 7 },
  }, frame);
  const normalized = normalizeTimedJourney({
    durationSecs: 5,
    cameraLookWaypoints: [asTarget, asQuaternion, asDirection, guideTarget],
  });

  assert.equal(added.kind, 'direction');
  assert.deepEqual(added.forward, frame.cameraForwardPc);
  assert.deepEqual(added.up, frame.cameraUpPc);
  assert.equal(asTarget.kind, 'target');
  assert.deepEqual(asTarget.targetPc, frame.targetPc);
  assert.deepEqual(asTarget.up, frame.cameraUpPc);
  assert.equal(asQuaternion.kind, 'quaternion');
  assert.deepEqual(asQuaternion.orientation, frame.orientationIcrs);
  assert.equal(asDirection.kind, 'direction');
  assert.deepEqual(asDirection.forward, { x: 1, y: 0, z: 0 });
  assert.deepEqual(asDirection.up, { x: 0, y: 0, z: 1 });
  assert.deepEqual(guideTarget.targetPc, SAMPLE_JOURNEY.guides[0].positionPc);
  assert.deepEqual(guideTarget.targetGuide, { id: 'guide-a', label: 'Guide A' });
  assert.equal('targetGuide' in manualTarget, false);
  assert.equal(normalized.cameraLookWaypoints.length, 4);
  assert.equal(normalized.cameraLookWaypoints.filter((waypoint) => waypoint.kind === 'target').length, 2);
  assert.equal(normalized.cameraLookWaypoints.filter((waypoint) => waypoint.kind === 'direction').length, 1);
  assert.equal(normalized.cameraLookWaypoints.filter((waypoint) => waypoint.kind === 'quaternion').length, 1);
  assert.deepEqual(normalized.cameraLookWaypoints.find((waypoint) => waypoint.id === 'cam-guide')?.targetGuide, { id: 'guide-a', label: 'Guide A' });
  assert.equal(cameraWaypointStyle('target').color, '#ffb454');
  assert.equal(cameraWaypointStyle('direction').color, '#5ddcff');
  assert.equal(cameraWaypointStyle('quaternion').color, '#72d7ff');
});

test('axis indicators map projection planes into the shared glyph model', () => {
  assert.deepEqual(summarizePlaneIndicator('xy'), {
    axes: [
      { axis: 'x', kind: 'arrow', vector: { x: 1, y: 0 } },
      { axis: 'y', kind: 'arrow', vector: { x: 0, y: -1 } },
      { axis: 'z', kind: 'perpendicular', direction: 'out' },
    ],
  });
  assert.deepEqual(summarizePlaneIndicator('xz'), {
    axes: [
      { axis: 'x', kind: 'arrow', vector: { x: 1, y: 0 } },
      { axis: 'z', kind: 'arrow', vector: { x: 0, y: -1 } },
      { axis: 'y', kind: 'perpendicular', direction: 'in' },
    ],
  });
  assert.deepEqual(summarizePlaneIndicator('yz'), {
    axes: [
      { axis: 'y', kind: 'arrow', vector: { x: 1, y: 0 } },
      { axis: 'z', kind: 'arrow', vector: { x: 0, y: -1 } },
      { axis: 'x', kind: 'perpendicular', direction: 'out' },
    ],
  });
});

test('camera axis indicators project finite screen vectors from camera orientation', () => {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.001, 1000);
  camera.position.set(10, 6, 14);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const axes = projectCameraAxisIndicators(camera);

  assert.deepEqual(axes.map((axis) => axis.axis), ['x', 'y', 'z']);
  for (const axis of axes) {
    assert.equal(Number.isFinite(axis.vector.x), true);
    assert.equal(Number.isFinite(axis.vector.y), true);
    assert.equal(Number.isFinite(axis.screenLength), true);
    assert.equal(Number.isFinite(axis.depth), true);
    assert.equal(axis.kind === 'arrow' || axis.kind === 'perpendicular', true);
    if (axis.screenLength > 1e-6) {
      assert.ok(Math.abs(Math.hypot(axis.vector.x, axis.vector.y) - 1) < 1e-9);
    }
  }

  const defaultCameraAxes = projectCameraAxisIndicators(new THREE.PerspectiveCamera());
  assert.equal(defaultCameraAxes.find((axis) => axis.axis === 'z')?.kind, 'perpendicular');
  assert.equal(defaultCameraAxes.find((axis) => axis.axis === 'z')?.direction, 'out');
});

test('headless editor handle updates snapshots, evaluates frames, and disposes cleanly', async () => {
  const changes = [];
  const editor = createJourneyVideoEditor({
    journey: SAMPLE_JOURNEY,
    editorState: { tileModes: ['xy', 'xz', 'yz', 'perspective'], unitsPerParsec: 3 },
    onChange(document) {
      changes.push(document);
    },
  });

  editor.setTime(4.97);
  assert.equal(editor.getSnapshot().timeSecs, 4.95);
  assert.ok(editor.evaluateAt(5).observerPc.x > 4);
  editor.setTileMode(1, 'skykit');
  editor.setUnitsPerParsec(6);
  editor.selectWidget('guide', 'guide-a');

  const snapshot = editor.getSnapshot();
  assert.equal(snapshot.tileModes[1], 'skykit');
  assert.equal(snapshot.selectedWidget?.id, 'guide-a');
  assert.equal(changes.length, 4);

  editor.setJourney({ ...SAMPLE_JOURNEY, id: 'next-journey', durationSecs: 6 });
  assert.equal(editor.getJourney().id, 'next-journey');
  assert.equal(changes.length, 5);

  await editor.dispose();
  assert.equal(editor.getSnapshot().disposed, true);
  assert.throws(() => editor.setTime(1), /disposed/u);
});

function summarizePlaneIndicator(mode) {
  const layout = getPlaneAxisIndicatorLayout(mode);
  return {
    axes: layout.axes.map((axis) => ({
      axis: axis.axis,
      kind: axis.kind,
      ...(axis.kind === 'arrow'
        ? { vector: axis.vector }
        : { direction: axis.direction }),
    })),
  };
}

test('video export helpers normalize layout and render profile defaults', () => {
  const layout = normalizeJourneyVideoLayout('vertical-1080x1920');
  assert.equal(layout.width, 1080);
  assert.equal(layout.height, 1920);
  assert.equal(layout.text.titleFontSize, 52);

  const profile = normalizeJourneyVideoRenderProfile({
    mode: 'final',
    layout: 'square-1080',
    fps: 6,
    seconds: 2,
    crf: 17,
    retainFrames: true,
  });
  assert.equal(profile.mode, 'final');
  assert.equal(profile.layout.id, 'square-1080');
  assert.equal(profile.frameCount, 12);
  assert.equal(profile.browser, 'webkit');
  assert.equal(profile.retainFrames, true);
});

test('video export helpers extract cue overlay blocks and opacity fades', () => {
  const blocks = createJourneyVideoOverlayBlocks({
    ...SAMPLE_JOURNEY,
    cues: [
      {
        id: 'cue-a',
        startSecs: 1,
        endSecs: 5,
        fadeInSecs: 1,
        fadeOutSecs: 2,
        eyebrow: 'Scale',
        title: 'Light has a speed.',
        body: 'A transparent block is rendered once, then composited later.',
      },
    ],
  });

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].id, 'cue-a');
  assert.equal(blocks[0].eyebrow, 'Scale');
  assert.equal(computeJourneyVideoOverlayOpacity(blocks[0], 0.5), 0);
  assert.equal(computeJourneyVideoOverlayOpacity(blocks[0], 2), 1);
  assert.equal(computeJourneyVideoOverlayOpacity(blocks[0], 4.5), 0.25);
});

test('video export helpers build ffmpeg overlay filters and args', () => {
  const overlayBlocks = [
    {
      id: 'cue-a',
      startSecs: 1,
      endSecs: 4,
      fadeInSecs: 0.5,
      fadeOutSecs: 0.75,
      eyebrow: '',
      title: 'Cue',
      body: '',
      assetPath: '/tmp/cue-a.png',
    },
  ];
  const filter = buildJourneyVideoFfmpegFilter(overlayBlocks);
  assert.match(filter, /fade=t=in/u);
  assert.match(filter, /overlay=0:0/u);
  assert.match(filter, /\[v\]/u);

  const args = buildJourneyVideoFfmpegArgs({
    profile: { mode: 'preview', fps: 12, layout: 'landscape-1080p', crf: 20 },
    skyFramePattern: '/tmp/frame-%06d.png',
    overlayBlocks,
    outputPath: '/tmp/out.mp4',
  });
  assert.deepEqual(args.slice(0, 5), ['-y', '-framerate', '12', '-i', '/tmp/frame-%06d.png']);
  assert.equal(args.includes('-filter_complex'), true);
  assert.equal(args.at(-1), '/tmp/out.mp4');
});

test('video export metadata and CLI options are deterministic', () => {
  const metadata = createJourneyVideoRenderMetadata({
    journey: { id: 'demo' },
    frameCount: 2,
  });
  assert.equal(metadata.format, 'fis-journey-video-render-v1');
  assert.equal(metadata.journey.id, 'demo');
  assert.equal(metadata.frameCount, 2);

  const options = normalizeJourneyVideoCliOptions([
    '--mode=preview',
    '--layout=landscape-1080p',
    '--frames=2',
    '--fps=1',
    '--journey=examples/radio-bubble/radio-bubble-journey.json',
    '--output-dir=video-output/test',
    '--discard-frames',
  ]);
  assert.equal(options.profile.frameCount, 2);
  assert.equal(options.profile.fps, 1);
  assert.equal(options.profile.retainFrames, false);
  assert.match(options.journeyPath, /examples\/radio-bubble\/radio-bubble-journey\.json$/u);
});
