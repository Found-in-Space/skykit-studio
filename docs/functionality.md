# SkyKit Studio Product Requirements

SkyKit Studio is a companion project to
[Found-in-Space/skykit](https://github.com/Found-in-Space/skykit). SkyKit core
owns the reusable browser viewer and runtime surface: `createSkykitViewer()`,
the browser embed handle, plugin lifecycle, action registry, product and
selection systems, inspect/debug hooks, navigation actions such as
`skykit:navigation.transitionTo`, `lockAt`, `orbit`, and `orbitalInsert`,
streaming star composition helpers, the animation loop, and the status/debug
bridge.

Studio should use that SkyKit runtime to author exact, editable, video-style
space flythroughs like the journeys found in the public website. Its job is to
add a professional shot-authoring layer: frame-accurate timing, editable camera
and scene keys, guide and annotation layers, timed overlay text, preview
playback, and deterministic frame export. Reusable viewer behavior stays in
SkyKit core.

## Scope

SkyKit Studio is the standalone editor and deterministic export tooling for
authored `fis-journey-v1` video journeys.

The package owns:

- editor state and editor document import/export;
- browser DOM layout for the journey video editor;
- orthographic, perspective, streamed SkyKit, and free-roam viewport layout;
- camera, observer, guide, cue, and inspector editing state;
- draft persistence helpers;
- deterministic browser render pages;
- cue text overlay PNG generation;
- Playwright-backed Node export orchestration and render metadata.

The package intentionally does not own low-level path/coordinate math or viewer
composition. Those remain in `@found-in-space/spatial` and
`@found-in-space/skykit`. Studio owns the authored video layer over those
packages: document normalization, exact timed evaluation, cue and track helpers,
editor state, retiming commands, render preflight state, and deterministic
export metadata.

## Professional Editor Model

Studio should feel familiar to people who have used digital content creation
and video tools such as Blender, Maya, Houdini, Unreal Sequencer, After Effects,
Premiere, or DaVinci Resolve. The domain is astronomical, but the authoring
language should follow established production patterns.

Core concepts:

- A journey is a sequence.
- A continuous visual section is a shot.
- Time-based values live on tracks.
- Editable values on tracks are keyframes, markers, or clips.
- Camera movement is a camera rig with position, aim, orientation, orbit, and
  time-remap channels.
- Text and callouts are title or annotation tracks.
- Guides are scene annotation layers and can also act as snap or aim targets.
- The timeline should offer a Dope Sheet-style view for timing and a Graph
  Editor-style view for interpolation, easing, and speed.
- The streamed SkyKit view is the program monitor: it shows the authored frame
  that should match export.
- Free-roam is a scout or layout camera: useful for finding poses, placing
  guides, and inspecting stars, but separate from the render camera.

When UI labels differ from storage names, prefer the production term in the
editor and keep the schema/API name explicit in developer documentation. For
example, UI can call a `locationWaypoint` an observer key and a
`cameraLookWaypoint` a camera key, while the document schema keeps the existing
field names.

## Target Video Families

Website lessons show the kinds of authored videos Studio should make easy to
produce. These are not separate applications. They are common shot types for one
frame-accurate authoring and export system.

### Constellation Journeys

Constellation videos should show how familiar sky patterns warp as the observer
moves through the real 3D star field.

Requirements:

- author a selected constellation or skyculture reference as an editable
  annotation layer;
- start from an Earth-like establishing shot where the constellation reads
  clearly;
- support dolly, truck, orbit, and fly-through camera moves that reveal distance
  structure and parallax;
- allow reference art, line work, labels, or guide geometry to fade, persist, or
  detach from the original sky projection during the shot;
- support screen-space and world-space label modes, with title-safe placement
  for narration overlays;
- time cue tracks to narration beats such as "from Earth this is a pattern" and
  "from here the shape breaks apart";
- preserve constellation selection, annotation visibility, and label state in
  deterministic frame export.

### Cluster Fly-Tos And Orbits

Cluster videos should support tours between named stellar groups, followed by
stable orbit or hold shots around each destination.

Requirements:

- author destination shot presets with center, label, radius, orbit normal,
  angular speed, dwell duration, default aim target, and framing scale;
- support smooth fly-to, explicit path, and orbit-transfer camera rigs between
  destinations;
- support arrival actions such as easing into an orbit, locking to a target,
  holding on a hero frame, or changing demand/preload strategy;
- allow long-distance journeys such as Omega Centauri without losing route
  determinism or streamed-star readiness;
- expose diagnostics for route length, duration, average speed, peak speed,
  arrival speed, and camera settle behavior;
- export camera motion and destination orbit motion from the same frame-indexed
  timeline.

### Spatial Object Narratives

Spatial-object videos, such as the radio bubble, should combine camera motion
with animated scene geometry and narration.

Requirements:

- author world-space meshes, procedural objects, or data-driven geometry as
  named scene layers;
- animate object scale, radius, opacity, material state, clipping, and
  visibility through parameter tracks;
- support driven keys where camera motion follows object animation, such as
  tracking the expanding edge of a shell;
- support timeline labels derived from animation progress, such as simulated
  dates, distances, or light-travel times;
- let authors edit cue text, object state, and camera framing against the same
  time ruler;
- export object animation deterministically without relying on wall-clock
  playback time.

### Physics And Model-Driven Journeys

Physics- or model-driven videos need synchronized motion, story events, and
animated connections through real nearby systems.

Requirements:

- author named object markers with physical positions, labels, and optional
  classes such as star, brown dwarf, planet, spacecraft, or relay point;
- support model-derived timeline events and driven keys, not only hand-placed
  camera keys;
- synchronize camera motion, object reveals, marker visibility, label
  visibility, and connecting-line animation on one exact timeline;
- support line or path tracks with delay, duration, interpolation, color,
  opacity, and partial-progress evaluation;
- allow branching or fan-out reveals where multiple links become active from
  one story event;
- keep scrub, preview, and exported frames identical for the same timestamp.

### Nebulae, Planetary Nebulae, And HII Regions

Nebula videos should support future mesh, point-cloud, shell, and volume assets
once those objects are created.

Requirements:

- import or reference authored mesh, point-cloud, shell, and volume layers;
- author exterior orbit shots, approach shots, reveal shots, and interior
  fly-through paths;
- animate clipping planes, opacity, color ramps, emission strength, density, and
  layer visibility over exact scene time;
- support scale and camera near/far policies suitable for large gas structures;
- support layer-specific preload/readiness checks before deterministic export;
- keep reusable renderer or data-loading behavior in SkyKit or focused data
  packages, with Studio owning timeline authoring and export state.

### Object-Class And Single-Object Emphasis

Videos about extrasolar planets, red dwarfs, white dwarfs, brown dwarfs, or
other object classes should be able to shift visual emphasis during the
timeline.

Requirements:

- author data-driven highlight layers using catalogue fields such as
  temperature, absolute magnitude, class, object type, planet status, or custom
  metadata;
- animate limiting magnitude, volume radius, shader parameters, color ramps,
  exposure, point size, selection state, and highlight opacity;
- support single-object focus shots with labels, orbit cameras, local scale
  changes, and contextual guide geometry;
- allow scene scale and shader emphasis to change at shot boundaries without
  breaking camera continuity;
- support future non-star object classes such as exoplanets and compact systems
  without hard-coding them into the editor core;
- record all emphasis parameters in render metadata so exported video frames can
  be reproduced.

## Shared Timeline Requirements

All target video families require one deterministic sequencer. A timestamp and
frame index must evaluate every animated channel needed for the final frame:

- observer position;
- camera orientation, aim target, roll, and up vector;
- target lock, orbit, path-follow, or free-camera state;
- overlay cue visibility, opacity, layout, and active text;
- guide, label, mesh, line, and object visibility;
- procedural animation progress;
- data-layer settings such as limiting magnitude, demand strategy, scale,
  shader parameters, and highlight filters.

The editor should make these tracks visible and editable together. Export should
evaluate them by frame index and scene time, not by live browser animation time.

### Time Display And Snapping

The timeline should support both seconds and frame/timecode display. The current
alpha snaps authored time values to `0.05` seconds; a production-oriented
workflow should expose this as a project or render-profile grid, usually derived
from FPS.

Requirements:

- show current time, frame number, journey duration, and active render FPS;
- support frame snapping, marker snapping, and optional free dragging;
- keep internal scene time deterministic and independent from display format;
- make render-profile changes explicit when they affect preview cadence, output
  frame count, or overlay timing.

### Track And Keyframe Model

Every editable timed value should be representable as a track channel, even when
the current implementation stores it in journey-specific arrays.

Required track families:

- observer position keys;
- camera aim, direction, quaternion, roll, and orbit keys;
- guide and annotation visibility keys;
- object parameter keys;
- cue/title clips;
- data-layer and shader parameter keys;
- story event markers;
- preload and readiness markers.

Timeline operations should respect common production controls:

- select, box-select, shift-select, and range-select keys;
- lock, mute, solo, or hide tracks where supported;
- move keys with snapping;
- scale selected keys around a pivot;
- copy, paste, duplicate, delete, and nudge keys;
- name and color-code story markers and shot ranges;
- keep linked selection explicit so camera, cues, objects, and labels can retime
  together or separately.

### Range Retiming

Studio must support retiming operations that match common 3D animation and
non-linear editing workflows.

Requirements:

- support ripple edits that extend or shorten a selected range and move later
  timeline material by the same amount;
- support roll edits at shot boundaries, changing the cut point between adjacent
  ranges without changing their combined duration;
- support slip edits that change which source motion appears inside a fixed
  shot duration;
- support slide edits that move a shot earlier or later while preserving its
  duration;
- support stretching selected keys so a section can change duration, such as
  making a 15 second section last 20 seconds for voice-over, while preserving
  internal key timing as percentages of the selected range;
- support time-remapping curves and speed ramps that preserve spatial path
  intent while changing the mapping from scene time to path progress;
- let authors choose which linked tracks retime with the camera, including
  overlay cues, object visibility, mesh animation, labels, line reveals, shader
  parameters, and data-layer settings;
- preserve, flatten, or scale tangent handles according to an explicit author
  choice;
- support event-relative timing for model-derived tracks, such as a line reveal
  that starts `0.75` seconds after a star marker appears;
- keep scrub, preview, and exported frames identical for the same timestamp
  after retiming.

### Interpolation And Easing

The current alpha offers speed equalization and start/end easing helpers for
location ranges. The editor should evolve this toward familiar curve-editing
controls.

Requirements:

- expose interpolation modes such as hold, linear, ease in/out, and custom
  Bezier-style tangents where the underlying track supports them;
- separate spatial interpolation from timing interpolation so a camera path can
  stay stable while speed changes;
- show velocity and acceleration diagnostics for camera moves;
- support ease presets for common camera moves such as settle, reveal, fly-by,
  orbit entry, and orbit exit;
- make helper keys visible as generated keys and allow authors to rebuild or
  delete them as a group;
- ensure retiming work stays in Studio-owned camera timeline authoring helpers
  built over lower-level spatial primitives and Studio document helpers.

## Editor Workflows

### Workspace And Viewport Layouts

The editor supports up to four panes, which should be presented as viewports in
the UI. Available pane modes are:

- `xy`;
- `xz`;
- `yz`;
- `perspective`;
- `preview`;
- `free-roam`.

Available layout presets are:

- `single`;
- `two-stacked`;
- `two-side-by-side`;
- `three-primary-left`;
- `three-primary-right`;
- `four-grid`.

Viewport controls should allow changing a viewport mode, moving viewports,
maximizing/restoring a viewport, adding viewports up to the four-viewport
limit, and removing viewports down to one viewport. Legacy tile mode state is
normalized into pane state, with legacy `skykit` mode mapped to `preview`.

Professional layout expectations:

- orthographic viewports are for layout, alignment, path editing, and guide
  placement;
- perspective viewports are for inspecting the scene and authored rig without
  changing the render camera;
- the program preview is the source of truth for the exported frame;
- free-roam is a scout camera for finding points of interest and placing
  guides;
- viewport overlays should be independently toggleable where practical, such as
  grids, paths, guides, labels, camera frustum, title safe, and axes.

### Transport And Timeline

The editor can set current time, play/pause, and loop back to zero when playback
passes journey duration. Time values currently snap to `0.05` seconds.

The timeline should read as a compact sequencer:

- a transport bar for current time, frame, duration, play/pause, loop, and
  scrub;
- a Dope Sheet-style lane area for observer keys, camera keys, guide keys,
  object tracks, cue clips, and markers;
- selectable keyframes and clips that can be dragged along the time ruler;
- shift-selectable observer keys for range retiming;
- visible shot ranges or chapter markers when a journey has editorial
  structure;
- clear distinction between selected keys, selected tracks, selected guides, and
  selected scene objects.

### Orthographic Projection Viewports

The `xy`, `xz`, and `yz` panes draw 2D canvas views centered on the evaluated
observer position. They render:

- grid lines;
- sampled journey path;
- selected location range path;
- guide volumes;
- observer keys;
- camera key markers;
- current observer marker;
- current camera direction;
- plane axis indicator.

Markers are hit-tested in screen space. Dragging a marker updates its point in
the active projection plane while preserving the third coordinate from the
current widget point.

Professional editing expectations:

- selected markers should expose transform handles or equivalent numeric fields;
- drag operations should preserve deterministic coordinates and be undoable once
  undo/redo exists;
- snapping should support grid, guide center, star pick, current observer, and
  existing key positions where available;
- camera direction markers should make aim drift obvious during scrubbing;
- framed range overlays should help authors understand where a move accelerates,
  settles, or changes shot intent.

### Perspective Layout View

The `perspective` pane uses Three.js and OrbitControls to render:

- sampled journey path;
- selected location range path;
- guide meshes;
- observer key meshes;
- camera key meshes;
- current observer;
- current camera direction;
- camera-space axis indicator.

Clicking a marker selects its widget. Orbit controls are viewport navigation for
previewing authored geometry and do not alter the journey camera.

Professional editing expectations:

- the view should support frame selected, frame all, and reset view behavior;
- the render camera path and aim target should be visible as overlays;
- generated helper keys should be distinguishable from authored keys;
- camera frustum, target lines, and orbit rings should be available overlays for
  shot blocking;
- viewport navigation state should never become hidden journey data.

### Program Preview View

The `preview` pane creates a SkyKit viewer with streamed stars and guide
objects. It follows the evaluated journey frame at the editor time by applying:

- observer position;
- camera orientation;
- target position;
- limiting magnitude.

It uses `@found-in-space/star-octree-provider`,
`@found-in-space/star-trees`, and `@found-in-space/three-star-field` through
SkyKit. The preview keeps a persistent browser cache by default unless
`preview.persistentCache` is set to `'off'`.

The program preview should behave like the final-frame monitor:

- scrub and playback should evaluate the same state as export;
- cue overlays should display with the same fade timing and layout as rendered
  overlay blocks;
- title-safe or action-safe guides should be available when editing text;
- star-streaming readiness should be visible before export;
- preview-only navigation should be disabled unless explicitly in a scouting or
  inspection mode.

### Free-Roam Scout View

The `free-roam` pane creates an interactive SkyKit viewer with:

- streamed stars;
- keyboard navigation;
- mouse look;
- star picking;
- synced guide meshes;
- camera-space axis indicator.

The first pose comes from `editorState.freeRoamPose` when available, otherwise
from the evaluated journey camera. Free-roam pose changes are persisted back to
editor state on a throttle.

The free-roam overlay can:

- add a guide at the current free-roam observer position;
- add a guide at the last picked star position;
- show the picked star label and coordinates.

Professional editing expectations:

- free-roam should be clearly labeled as a scout camera, not the render camera;
- authors should be able to copy the scout pose into an observer key or camera
  key when they decide to use it;
- picked stars should be usable as guide centers, aim targets, label anchors, or
  story markers;
- any persisted scout pose should remain editor state and not affect deterministic
  export unless converted into authored keys.

### Outliner And Inspector

The sidebar should function as an outliner plus inspector, not just a list of
raw schema entries.

It should support:

- adding observer keys at the current evaluated observer position;
- adding camera keys at the current evaluated camera frame;
- adding guide volumes and annotation layers;
- selecting, editing, and deleting observer keys, camera keys, guides, cues, and
  future object tracks;
- showing the selected item's track membership, time, type, and generated or
  authored status;
- grouping helper keys created by easing, retiming, or camera-rig commands.

Observer key editing currently covers time and position.

Camera key editing supports three camera key models:

- `target`: target point, up vector, and optional copied guide target metadata;
- `direction`: forward vector and up vector;
- `quaternion`: orientation quaternion.

Guide editing supports:

- label;
- sphere or cube shape;
- position;
- color;
- radius/size;
- delete.

Production-facing labels should describe these as aim-target, direction, and
orientation key modes, while preserving the existing schema values.

### Overlay And Cue Authoring

Cue text is part of the edit, not a post-render afterthought. Studio should
treat cues as title clips on an overlay track.

Requirements:

- show cue clips on the timeline with in/out handles and fade handles;
- support text editing, line breaks, and styling constraints compatible with
  cached transparent overlay blocks;
- expose title-safe layout options for landscape, vertical, square, and portrait
  layouts;
- allow cue timing to snap to story markers, camera keys, object events, and
  frame boundaries;
- make overlay opacity deterministic for scrub, preview, and final export;
- record overlay layout/profile decisions in render metadata.

### Retiming And Easing Panel

When an observer range is selected, the sidebar shows diagnostics for:

- current range speed;
- preview after speed equalization;
- preview after start/end easing.

Available actions:

- equalize observer range speed;
- insert start/end easing helper keys;
- select an existing ease helper group;
- rebuild an existing ease group;
- delete ease helpers for a group phase.

As the editor matures, this panel should become a focused timing tool with:

- range duration controls;
- target average speed controls;
- ease preset controls;
- linked-track retiming options;
- before/after diagnostics for duration, distance, speed, and frame count.

## Export Workflows

### Browser-Safe Export Helpers

`src/export.js` provides deterministic helper behavior that can be imported
without Playwright or ffmpeg.

It defines layout profiles for:

- `landscape-4k`;
- `landscape-1080p`;
- `vertical-1080x1920`;
- `square-1080`;
- `portrait-1080x1350`.

It defines render profiles for:

- `preview`: 1080p landscape, 12 fps, WebKit, CRF 20, retain frames;
- `final`: 4K landscape, 24 fps, WebKit, CRF 18, discard frames.

It can also:

- normalize custom layout and render profile input;
- extract cue text overlay blocks from journey `cues`;
- compute overlay opacity for fade-in and fade-out;
- build a full ffmpeg filter graph for overlay compositing;
- build ffmpeg MP4/H.264 command arguments;
- stamp render metadata with `fis-journey-video-render-v1`.

### Render Runner And Profiles

The Node export runner lives behind
`@found-in-space/skykit-studio/export/node`. Normal browser editor usage and
browser-safe package imports must remain usable without Playwright, browsers, or
ffmpeg installed.

The render workflow should follow production rendering conventions:

- `preview` behaves like a playblast or editorial review export: lower frame
  rate, retained frames, faster iteration;
- `final` behaves like a final render profile: full layout, expected frame rate,
  composited overlays, and explicit metadata;
- ffmpeg is an external binary on `PATH`;
- Playwright usage stays isolated to the Node export runner;
- render pages evaluate the journey by frame index and scene time;
- overlay blocks are cached as transparent PNG assets before ffmpeg
  compositing;
- every output includes metadata sufficient to reproduce the render.

### Render Preflight

Before export, Studio should be able to report whether the sequence is ready to
render.

Preflight checks should include:

- journey duration, FPS, frame count, and selected layout profile;
- missing or invalid camera/observer keys;
- active cue clips and overlay block count;
- streamed-star readiness for the required frame range;
- guide, label, object, and data-layer visibility at render time;
- ffmpeg availability for Node export;
- Playwright/browser availability only when using
  `@found-in-space/skykit-studio/export/node`;
- output directory, retained-frame policy, and metadata path.

Unit tests should not require Playwright, browsers, or ffmpeg. Full export smoke
coverage belongs behind `npm run test:integration:export`.
