// @ts-nocheck

export const DEFAULT_JOURNEY_VIDEO_GUIDE_RADIUS_PC = 1;
export const DEFAULT_JOURNEY_VIDEO_GUIDE_COLOR = '#8fd5ff';
export const DEFAULT_JOURNEY_VIDEO_GUIDE_OPACITY = 0.45;

/**
 * @param {Array<Record<string, unknown>>} existingGuides
 * @param {unknown} pointPc
 * @param {Record<string, unknown>} [options]
 */
export function createJourneyVideoGuideDraft(existingGuides, pointPc, options = {}) {
  const guides = Array.isArray(existingGuides) ? existingGuides : [];
  const radiusPc = positiveNumber(options.radiusPc ?? options.sizePc, DEFAULT_JOURNEY_VIDEO_GUIDE_RADIUS_PC);
  const label = labelText(options.label, `Guide ${guides.length + 1}`);
  return {
    id: nextGuideId(guides),
    label,
    shape: 'sphere',
    positionPc: clonePoint(pointPc),
    radiusPc,
    sizePc: radiusPc,
    color: colorText(options.color, DEFAULT_JOURNEY_VIDEO_GUIDE_COLOR),
    opacity: clamp(finiteNumber(options.opacity, DEFAULT_JOURNEY_VIDEO_GUIDE_OPACITY), 0, 1),
  };
}

/**
 * @param {Array<Record<string, unknown>>} entries
 */
function nextGuideId(entries) {
  const ids = new Set(entries.map((entry) => entry.id));
  let index = entries.length + 1;
  while (ids.has(`guide-${index}`)) index += 1;
  return `guide-${index}`;
}

/** @param {unknown} point */
function clonePoint(point) {
  const source = /** @type {Record<string, unknown>} */ (point && typeof point === 'object' ? point : {});
  return {
    x: finiteNumber(source.x, 0),
    y: finiteNumber(source.y, 0),
    z: finiteNumber(source.z, 0),
  };
}

/** @param {unknown} value @param {string} fallback */
function labelText(value, fallback) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

/** @param {unknown} value @param {string} fallback */
function colorText(value, fallback) {
  const text = String(value ?? '').trim();
  return /^#[0-9a-f]{6}$/iu.test(text) ? text : fallback;
}

/** @param {unknown} value @param {number} fallback */
function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/** @param {unknown} value @param {number} fallback */
function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
