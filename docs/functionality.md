# SkyKit Studio Functionality Review

SkyKit Studio is a companion project to
[Found-in-Space/skykit](https://github.com/Found-in-Space/skykit). SkyKit core
owns the reusable browser viewer and runtime surface: `createSkykitViewer()`,
the browser embed handle, plugin lifecycle, action registry, product and
selection systems, inspect/debug hooks, navigation actions such as
`skykit:navigation.transitionTo`, `lockAt`, `orbit`, and `orbitalInsert`,
streaming star composition helpers, the animation loop, and the status/debug
bridge.

This package should use that SkyKit runtime to author exact, editable,
video-style space flythroughs like the journeys found in the public website.
Its job is to add deterministic timing, editable journey markers, timed overlay
text, and individual frame export for video creation, while keeping reusable
viewer behavior in SkyKit core.

## Scope

SkyKit Studio is the standalone editor and deterministic export tooling
for authored `fis-journey-v1` video journeys.

The package owns:

- editor state and editor document import/export;
- browser DOM layout for the journey video editor;
- projection, perspective, streamed SkyKit, and free-roam preview panes;
- guide, location waypoint, and camera waypoint editing;
- draft persistence helpers;
- deterministic browser render pages;
- cue text overlay PNG generation;
- Playwright-backed Node export orchestration and render metadata.

The package intentionally does not own low-level path/coordinate math or viewer
composition. Those remain in `@found-in-space/spatial` and
`@found-in-space/skykit`. Studio should own its camera timeline and authored
video journey layer: document normalization, exact timed evaluation, cue/track
helpers, retiming helpers, editor state, and deterministic export metadata.

## Editor Workflows

### Pane Layouts

The editor supports up to four panes. Available pane modes are:

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

Pane controls allow changing a pane mode, moving panes, expanding/restoring a
single pane, adding panes up to the four-pane limit, and removing panes down to
one pane. Legacy tile mode state is normalized into pane state, with legacy
`skykit` mode mapped to `preview`.

### Transport and Timeline

The editor can set current time, play/pause, and loop back to zero when playback
passes journey duration. Time values are snapped to `0.05` seconds.

The timeline renders separate location and camera lanes. Location and camera
markers can be selected and dragged along the timeline to update waypoint time.
Shift-selecting location waypoints creates a selected location range for
retiming tools.

### Projection Views

The `xy`, `xz`, and `yz` panes draw a 2D canvas view centered on the evaluated
observer position. They render:

- grid lines;
- sampled journey path;
- selected location range path;
- guide volumes;
- location waypoints;
- camera waypoint markers;
- current observer marker;
- current camera direction;
- plane axis indicator.

Markers are hit-tested in screen space. Dragging a marker updates its point in
the active projection plane while preserving the third coordinate from the
current widget point.

### Perspective View

The `perspective` pane uses Three.js and OrbitControls to render:

- sampled journey path;
- selected location range path;
- guide meshes;
- location waypoint meshes;
- camera waypoint meshes;
- current observer;
- current camera direction;
- camera-space axis indicator.

Clicking a marker selects its widget. Orbit controls are for previewing the
authored geometry and do not alter the journey camera.

### SkyKit Preview View

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

### Free-Roam View

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

### Waypoint and Guide Editing

The sidebar supports:

- adding location waypoints at the current evaluated observer position;
- adding camera waypoints at the current evaluated camera frame;
- adding guide volumes;
- selecting, editing, and deleting location waypoints, camera waypoints, and
  guides.

Location waypoint editing currently covers time and position.

Camera waypoint editing supports three camera key models:

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

### Retiming and Easing

When a location range is selected, the sidebar shows diagnostics for:

- current range speed;
- preview after speed equalization;
- preview after start/end easing.

Available actions:

- equalize location range speed;
- insert start/end easing helper waypoints;
- select an existing ease helper group;
- rebuild an existing ease group;
- delete ease helpers for a group phase.

Retiming work belongs in Studio-owned camera timeline authoring helpers built
over lower-level spatial track primitives.

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
