# Agent Instructions

## JavaScript / Node.js Project

- Runtime: plain ES modules (`"type": "module"`).
- This repository is the standalone alpha editor and deterministic export
  tooling for authored `fis-journey-v1` videos.
- It depends on the published SkyKit alpha packages from npm.
- Keep runtime package entry points in `src/index.js`, `src/editor.js`,
  `src/export.js`, and `src/export-node.js`, with hand-written `.d.ts`
  contracts beside them.

## Project Boundary

- `@found-in-space/spatial` owns path and coordinate math.
- `@found-in-space/skykit` owns viewer composition.
- `@found-in-space/skykit-studio` owns editor state, DOM layout, projection
  tiles, inspector state, `fis-journey-v1` camera timeline
  normalization/evaluation, retiming helpers, import/export, draft storage,
  deterministic render pages, overlay block assets, ffmpeg argument
  construction, and export metadata.
- Do not import website Astro code or old SkyKit runtime internals into this
  package.
- Put reusable viewer/runtime behavior in `../skykit` only when it has a clear
  package boundary outside the studio.

## Deterministic Export

- The browser editor and package exports must remain usable without Playwright,
  browsers, or ffmpeg installed.
- Keep Playwright usage behind `@found-in-space/skykit-studio/export/node`.
- Treat `ffmpeg` as an external binary on `PATH`; do not bundle it.
- Unit tests should not require Playwright, browsers, or ffmpeg. Full export
  smoke coverage belongs behind `npm run test:integration:export`.
- Preserve deterministic render behavior: browser canvas capture, cached
  transparent overlay blocks, ffmpeg compositing, and explicit render metadata.

## Standard Commands

- Install dependencies: `npm install`
- Run tests: `npm test`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Dev server: `npm run dev`
- Install export browsers: `npm run video:install-browsers`
- Run render smoke preview: `npm run video:journey:test`

## Documentation

- `README.md` describes the public package boundary and editor/export workflow.
- `TODO.md` tracks active studio follow-up work.
- `../skykit/AGENTS.md` describes the reusable SkyKit package workspace and its
  package-boundary rules.
