# SkyKit Studio Target Architecture

This document describes the architecture SkyKit Studio needs in order to become
a professional journey authoring application. It is intentionally more about
the target system than the current alpha implementation.

The product requirements live in [functionality.md](./functionality.md). This
architecture translates those requirements into application structure:
shared state, deterministic sequence evaluation, flexible panes and panels,
viewport adapters, timeline tooling, and export boundaries.

## Architecture Goals

SkyKit Studio should be a digital content creation and non-linear editing shell
for authored `fis-journey-v1` journeys.

The architecture should support:

- one shared application state that every panel reads from and mutates through
  explicit commands;
- deterministic frame evaluation for scrub, preview, and export;
- flexible panes, panel stacks, workspace presets, and viewport layouts similar
  to Premiere, DaVinci Resolve, Blender, Maya, Houdini, and Unreal Sequencer;
- reusable panel modules for program preview, orthographic layout, perspective
  layout, free-roam scouting, timeline, graph editor, outliner, inspector,
  render preflight, and diagnostics;
- undoable authoring operations instead of view-local mutations;
- package boundaries where `@found-in-space/spatial` owns coordinate/path math,
  `@found-in-space/skykit` owns viewer composition, and Studio owns the editor,
  timeline, import/export, render metadata, and authoring state;
- browser-safe editor imports without Playwright, browsers, or ffmpeg;
- isolated Node export orchestration behind
  `@found-in-space/skykit-studio/export/node`.

## System Layers

The target application has these layers:

```text
Public package entry points
  createJourneyVideoEditor(), import/export helpers, render helpers

Application shell
  workspace layout, pane docking, panel lifecycle, focus, keyboard routing

Shared store
  document state, editor state, workspace state, selection, playback, render UI

Command and history layer
  typed editor commands, transactions, undo/redo, drag previews, persistence

Document and sequence model
  normalized fis-journey-v1 data, Studio authoring data, tracks, clips, keys

Evaluation graph
  frame-indexed camera, observer, overlay, guide, object, and data-layer state

Panel and viewport adapters
  timeline, graph, inspector, outliner, projection, perspective, preview,
  free-roam, render preflight, diagnostics

Runtime services
  SkyKit viewers, Three.js resources, star streaming, storage, draft persistence

Export services
  browser-safe profile helpers, render pages, overlay assets, Node runner,
  ffmpeg argument construction, metadata
```

The important rule is that authoring panels do not own truth. Panels own DOM,
canvas, WebGL resources, pointer state, and temporary interaction state, but the
shared store owns the document, editor selection, workspace layout, current
time, timeline edits, and render-relevant settings.

## State Model

The application needs a clear split between persistent state, workspace state,
ephemeral runtime state, and derived state.

### Persistent Project State

Persistent project state is the authored content needed to reproduce the
journey:

- `format`;
- normalized `fis-journey-v1` journey data;
- Studio-owned authoring metadata that does not belong in SkyKit core;
- sequence duration, frame rate, time display, and snap settings;
- tracks, clips, keyframes, markers, cue/title clips, guides, object layers,
  scene layers, and render profile choices when they are project-specific;
- export-safe overlay layout/profile decisions;
- render-relevant layer settings such as limiting magnitude, shader emphasis,
  object visibility, preload markers, and readiness requirements.

This state must be serializable. It should not contain DOM nodes, Three.js
objects, SkyKit viewer handles, pointer event objects, timers, promises, or
browser-only resources.

### Workspace State

Workspace state describes how the user is looking at and editing the project:

- open panes and panel stacks;
- active workspace preset;
- split directions, split ratios, tab order, active tab, and maximized panel;
- per-panel view options such as viewport camera pose, overlay toggles, title
  safe visibility, grid visibility, and timeline zoom;
- free-roam scout pose;
- selected tool, active panel, active viewport, keyboard focus, and command
  palette state.

Some workspace state can travel with an editor document for draft continuity.
Some can be user preference. The architecture should keep those concerns
separate so exported journeys are not polluted with personal layout choices.

### Ephemeral Runtime State

Ephemeral runtime state is required to run the editor but must not be serialized
as authored data:

- SkyKit viewer instances;
- Three.js scenes, cameras, controls, renderers, and geometries;
- star streaming providers and cache handles;
- ResizeObserver state;
- requestAnimationFrame handles;
- in-progress drag pointer captures;
- pending async readiness checks;
- transient hover state unless intentionally promoted to editor selection.

Panels can own this state internally. When it becomes meaningful authoring
intent, it must be committed through a command.

### Derived State

Derived state should be recomputed from project and editor state:

- normalized journey;
- compiled sequence and track index;
- sampled paths and diagnostic curves;
- evaluated frame at current time;
- visible timeline rows;
- active cue/title overlays;
- preflight summaries;
- selection-derived inspector models;
- render frame count and output metadata preview.

Derived state can be cached, but cache invalidation should be tied to explicit
store revisions so scrub, preview, and export remain consistent.

## Shared Application Store

The editor should have one shared store exposed to panels through a small
context API.

```js
{
  getSnapshot(),
  subscribe(listener),
  dispatch(command),
  services
}
```

Snapshots should be immutable from the point of view of panels. A panel that
wants to change something dispatches a command. The command layer validates,
normalizes, mutates state, recomputes derived state, records history where
appropriate, persists drafts, and notifies subscribers.

Recommended top-level state domains:

```js
{
  document: {
    format,
    journey,
    studio,
    metadata
  },
  project: {
    sequenceId,
    fps,
    durationSecs,
    snap,
    renderProfiles
  },
  timeline: {
    currentTimeSecs,
    playback,
    zoom,
    visibleRange,
    selectedKeys,
    selectedClips,
    selectedTracks,
    selectedMarkers
  },
  scene: {
    selectedObjects,
    activeGuideId,
    activeLayerIds,
    overlayVisibility
  },
  workspace: {
    activeWorkspaceId,
    layouts,
    activePanelId,
    maximizedPanelId
  },
  tools: {
    activeTool,
    transformMode,
    snapping
  },
  render: {
    profileId,
    layoutProfileId,
    preflight,
    lastRender
  }
}
```

This shape is illustrative, not a required exported schema. The invariant is
that every panel can answer the same questions from the same state:

- What time is the sequence at?
- What frame would export render?
- What is selected?
- Which object, guide, key, clip, or track is being edited?
- Which viewport is active?
- Which workspace layout is visible?
- Which render profile is active?

## Command And History Layer

All meaningful edits should flow through typed commands.

Examples:

- `timeline.setTime`;
- `timeline.setFps`;
- `timeline.moveKeys`;
- `timeline.scaleRange`;
- `timeline.rippleRange`;
- `timeline.setClipInOut`;
- `selection.select`;
- `selection.extend`;
- `camera.addObserverKey`;
- `camera.addAimKey`;
- `camera.convertScoutPoseToKeys`;
- `guide.create`;
- `guide.update`;
- `workspace.splitPane`;
- `workspace.openPanel`;
- `workspace.movePanel`;
- `workspace.savePreset`;
- `viewport.setOverlayVisibility`;
- `render.setProfile`;
- `render.runPreflight`.

Commands should support:

- validation before mutation;
- transaction grouping for drag, nudge, paste, retime, and generated helper
  operations;
- undo/redo where the command changes authored or workspace state;
- history merging for continuous slider/drag changes;
- explicit no-history commands for playback ticking, hover, streaming status,
  and other transient UI updates;
- draft persistence after committed changes;
- stable error reporting through the shared app shell.

Dragging should have two phases:

1. A preview phase that updates transient interaction state and derived preview.
2. A commit phase that writes one undoable command to history.

This keeps timeline drags, viewport marker drags, inspector edits, and retiming
tools predictable.

## Flexible Workspace, Panes, And Panels

Studio should use professional workspace concepts rather than a fixed set of
hard-coded tiles.

Definitions:

- A workspace is a named arrangement of panes and panels, such as Editing,
  Animation, Graph, Scout, Review, or Render.
- A pane is a dockable region in the workspace layout.
- A panel is a tool hosted inside a pane, often as a tab.
- A viewport is a panel whose main content is a rendered view of the scene.
- A layout preset is a saved workspace tree with pane splits, panel stacks, and
  active tabs.

The current four-pane model is a useful alpha seed, but the target layout
should be represented as a split tree:

```js
{
  id: "workspace-editing",
  root: {
    type: "split",
    direction: "horizontal",
    ratio: 0.68,
    first: {
      type: "split",
      direction: "vertical",
      ratio: 0.72,
      first: { type: "stack", activePanelId: "program", panelIds: ["program"] },
      second: { type: "stack", activePanelId: "timeline", panelIds: ["timeline", "graph"] }
    },
    second: {
      type: "stack",
      activePanelId: "inspector",
      panelIds: ["outliner", "inspector", "preflight"]
    }
  }
}
```

The shell should support:

- split pane horizontally or vertically;
- resize splitters;
- tab panels in a pane;
- move panels between panes;
- maximize and restore a panel;
- close, reopen, and reset panels;
- save, reset, and switch workspace presets;
- route keyboard commands to the active panel first, then to global handlers;
- preserve panel state by stable panel id;
- enforce resource limits for expensive WebGL viewports without forcing every
  panel into a fixed tile array.

Floating windows can be deferred. Docking, splitting, tab stacks, maximization,
and saved workspaces are the essential behavior.

### Panel Registry

Panels should be registered by type. A panel definition describes how the shell
creates, mounts, updates, resizes, serializes, and disposes the panel.

```js
{
  type: "viewport.program",
  title: "Program",
  icon: "monitor",
  defaultState: {},
  createPanel(context) {
    return {
      mount(host),
      update(snapshot),
      resize(size),
      focus(),
      dispose(),
      serializeState()
    };
  }
}
```

Panel context should include:

- the shared store API;
- services such as SkyKit factories, asset loading, storage, and error
  reporting;
- panel id and local panel state;
- panel size and device pixel ratio;
- focus and command registration hooks.

Panels should not import each other directly. Cross-panel behavior should happen
through shared state and commands. For example, a star picked in free-roam can
become a selected candidate target in shared state, and the inspector can offer
commands to create a guide, aim key, label anchor, or story marker from it.

### Required Panel Families

Viewport panels:

- Program Preview: render-camera monitor that should match export.
- Perspective Layout: editable 3D layout view for paths, guides, and scene
  structure.
- Orthographic Projection: `xy`, `xz`, and `yz` layout planes.
- Free-Roam Scout: interactive SkyKit view for finding poses and picking stars.

Sequencer panels:

- Timeline/Dope Sheet: tracks, keys, clips, markers, shot ranges, linked
  retiming.
- Graph Editor: interpolation curves, speed, velocity, easing, tangents.
- Shot/Range Editor: roll, ripple, slip, slide, and duration controls.

Editing panels:

- Outliner: sequence, shots, tracks, scene layers, guides, labels, objects.
- Inspector: context-sensitive properties for selected items.
- Asset/Layer Browser: mesh, point cloud, shell, volume, overlay, and data
  layers as they become available.
- Tool Settings: active transform, snap, grid, and overlay options.

Render panels:

- Render Preflight: readiness, frame count, profile, output, dependencies.
- Render Queue/History: recent renders, metadata, artifacts, retained frames.

Diagnostics panels:

- Status/Console: errors, warnings, stream readiness, command log.
- Motion Diagnostics: route length, average speed, peak speed, acceleration,
  settle behavior.

## Viewport Architecture

Each viewport should be an adapter from shared evaluated state to a specific
interactive rendering surface.

The viewport adapter contract:

- read the same evaluated frame as every other panel;
- own its renderer and controls internally;
- expose overlay toggles through workspace or panel state;
- dispatch commands for authoring changes;
- keep navigation state separate from authored camera state unless explicitly
  converted;
- dispose WebGL and event resources cleanly.

Program Preview is special: it is the final-frame monitor. It should apply the
evaluated observer, camera orientation, target state, data-layer settings, guide
visibility, object animation, and overlay preview for the current scene time.
It should not silently change the render camera through navigation controls.

Perspective Layout is for editing and inspection. It can have an orbit camera,
frame selected, frame all, local overlays, and transform handles. Its navigation
camera is workspace or panel state, not journey data.

Orthographic Projection viewports are layout planes. They should support
screen-space hit testing, marker dragging, transform handles, grid and guide
snapping, path overlays, selected range overlays, camera direction indicators,
and frame-safe coordinate updates.

Free-Roam Scout is a scout camera. It can persist a scout pose in editor or
workspace state, but that pose affects deterministic export only after the user
converts it into authored observer keys, camera keys, guides, label anchors, or
story markers.

## Timeline And Sequence Model

The editor needs a normalized sequence model even when the stored journey schema
continues to use journey-specific arrays.

At runtime, Studio should compile the document into a track index:

```js
{
  sequence: {
    id,
    durationSecs,
    fps,
    tracks: [
      {
        id,
        type,
        name,
        locked,
        muted,
        solo,
        color,
        channels,
        clips,
        markers
      }
    ]
  }
}
```

Required track families:

- observer position;
- camera aim, direction, quaternion, roll, orbit, and time remap;
- guide and annotation visibility;
- object parameter animation;
- cue/title clips;
- data-layer and shader settings;
- story events;
- preload and readiness markers;
- generated helper keys for easing, speed equalization, and retiming.

The track model should support:

- stable ids for tracks, channels, clips, keys, and markers;
- authored versus generated key status;
- linked selection groups;
- lock, mute, solo, hide, and color where appropriate;
- selected ranges and shot ranges;
- event-relative timing;
- per-channel interpolation modes;
- timecode, frame, and seconds display;
- frame-based snapping derived from render profile FPS.

Adapters should map between stored schema and track model:

- Load adapters normalize `locationWaypoints`, `cameraLookWaypoints`, `cues`,
  guides, layers, and future object animation into track rows.
- Edit adapters apply command results back to the document schema.
- Export adapters evaluate the same compiled tracks by frame index.

This lets the UI use production language like observer key, aim key, title
clip, object track, or story marker while the saved schema can preserve existing
field names.

## Evaluation Graph

Every exported frame should come from a pure evaluation pipeline:

```text
document + project settings + render profile
  -> normalized sequence
  -> compiled tracks
  -> evaluate({ sceneTimeSecs, frameIndex, fps })
  -> frame state
  -> viewport adapters or export render page
```

Frame state should include:

- observer position;
- camera orientation, target, roll, up vector, and projection settings;
- target lock, orbit, path-follow, and time-remap state;
- guide, label, object, mesh, line, and layer visibility;
- object parameters such as scale, radius, opacity, material, clipping, and
  partial progress;
- data-layer settings such as limiting magnitude, demand/preload strategy,
  shader parameters, highlight filters, and point size;
- active cue/title clips, text, layout, opacity, and title-safe placement;
- story events and event-relative derived timing;
- render metadata inputs.

Evaluation must be deterministic:

- no wall-clock time;
- no hidden dependence on requestAnimationFrame cadence;
- no viewport-only navigation state in exported camera state;
- no asynchronous streaming side effects that change authored values;
- exact same timestamp produces the same frame state in scrub, preview, and
  export.

The evaluator can cache compiled tracks and sampled paths, but the cache should
be invalidated by document revision, track revision, render profile revision,
or workspace options that affect only display.

## Selection And Inspector Model

Selection should be shared and typed, not embedded separately inside each
panel.

Selection state should support:

- active item;
- selected item sets by domain;
- selected keys, clips, tracks, markers, guides, objects, labels, and layers;
- anchor and focus for range selection;
- linked selection groups;
- hover and preview candidate state where useful;
- selection source for better inspector behavior.

The inspector should be a projection of shared selection. It should not need to
know which panel created the selection. A selected star-pick candidate, guide,
camera key, observer key, cue clip, object layer, or render profile should each
resolve to an inspector model with available fields and commands.

## Services And Package Boundaries

Studio-owned services:

- editor store and command layer;
- workspace layout and panel runtime;
- document import/export and draft storage;
- track compilation and sequence adapters;
- deterministic frame evaluation for Studio-authored timeline state;
- overlay block extraction and layout;
- render preflight and render metadata;
- ffmpeg argument construction;
- Node export runner behind the Node-only entry point.

SkyKit-owned behavior:

- viewer composition;
- plugin lifecycle;
- action registry;
- streamed star viewer integration;
- product and selection systems that are reusable outside Studio;
- runtime inspect/debug hooks;
- navigation actions that belong to the viewer package.

Spatial-owned behavior:

- path and coordinate math;
- vector and coordinate transforms that are not editor-specific;
- reusable interpolation primitives when they are package-level concerns.

The editor should depend on public package APIs, not website Astro code or old
runtime internals.

## Persistence And Versioning

Studio needs three related persistence streams:

Project document:

- authoring content;
- normalized journey;
- Studio metadata required to continue editing;
- render-relevant profile choices.

Workspace/user state:

- open workspaces;
- panel layout;
- panel-local view settings;
- user preferences;
- recent files or drafts where applicable.

Render metadata:

- source format and render format;
- normalized render profile and layout profile;
- frame range, FPS, duration, and output paths;
- overlay block information;
- stream/readiness stats;
- export dependency versions where practical;
- enough input metadata to reproduce the render.

Every persisted structure should have a format/version string and a
normalization path. Migration should happen at import boundaries, not scattered
inside panels.

## Render And Export Boundary

Browser editor usage and browser-safe package imports must remain independent
of Playwright, installed browsers, and ffmpeg.

The export architecture should keep:

- profile normalization, overlay block extraction, overlay opacity, filter graph
  construction, ffmpeg argument construction, and metadata helpers in the
  browser-safe export module;
- Playwright/browser orchestration and file-system render execution in
  `@found-in-space/skykit-studio/export/node`;
- ffmpeg as an external binary on `PATH`;
- full export smoke coverage behind `npm run test:integration:export`.

The render page should consume the same document and evaluator semantics as the
editor. The program preview and export page should differ in shell and
readiness policy, not in what frame state means.

## Testing Strategy

Unit tests should cover:

- document normalization and migration;
- pane, panel, and workspace layout reducers;
- command handlers and undo/redo transactions;
- selection behavior;
- track adapters;
- frame-indexed evaluation;
- retiming, easing, and interpolation helpers;
- overlay extraction and opacity;
- render profile and metadata helpers.

DOM-level tests should cover:

- panel lifecycle contracts;
- resizing behavior;
- focus and keyboard routing;
- command dispatch from representative panels.

Integration tests should cover:

- editor import/export round trips;
- representative authoring workflows;
- render page evaluation;
- export smoke tests with Playwright and ffmpeg only behind the integration
  command.

## Migration From The Alpha

The current alpha already has useful foundations:

- normalized editor documents;
- normalized panes and pane layout state;
- a mount/update/resize/dispose view lifecycle;
- projection, perspective, preview, and free-roam views;
- deterministic export helpers and Node export isolation.

Recommended migration path:

1. Introduce the shared store as an explicit module around the current editor
   model, preserving the public `createJourneyVideoEditor()` API.
2. Rename internal tile concepts toward pane and panel concepts while keeping
   legacy aliases at import boundaries.
3. Add a command registry and transaction history around existing mutations.
4. Generalize current pane modes into registered panel definitions.
5. Replace fixed layout presets with a split-tree workspace model while
   preserving existing presets as named layouts.
6. Compile existing journey arrays into a runtime track index for the timeline
   and inspector.
7. Move timeline, inspector, retiming, and viewport edits onto the command
   layer.
8. Add graph-editor and track-channel support without changing export semantics.
9. Expand render preflight and metadata from the same shared state and evaluator.

This keeps the alpha usable while moving the architecture toward the application
Studio needs: a deterministic, shared-state, professional authoring environment
with flexible workspaces instead of isolated tiles.
