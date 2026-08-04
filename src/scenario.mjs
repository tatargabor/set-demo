// Scenario normalisation — the ONE place where field names are resolved.
//
// The engine grew out of a Hungarian project, so the original scenario schema used Hungarian
// field names (`cimke`, `kattint`, `fokusz`, …). The package speaks English now, but those
// scenarios still have to run: a recording is evidence, and invalidating it because a key was
// renamed would throw away the proof, not improve it.
//
// So: English is the schema. Hungarian names are accepted as aliases, resolved HERE, once, at
// the boundary. Everything downstream sees English only.
//
// ⚠ Do NOT spread aliases through the codebase. Two names reaching the same `if` in five
// different files is how a schema quietly forks: someone adds `expect` handling and forgets
// `elvaras`, and the older scenarios lose their expectation gate — silently, because a missing
// expectation is not an error, it is just "this step proves nothing".

/** Scenario-level keys. */
const SCENARIO_ALIASES = {
  cim: "title",
  alcim: "subtitle",
  verzio: "version",
  bevezeto: "intro",
  nezet: "viewport",
  mobil: "mobile",
  vago: "crop",
  tempo: "pace",
  felirat: "captions",
  lepesek: "steps",
  elokeszites: "setup",
  elokeszitesNezet: "setupViewport",
  maxOldal: "maxSide",
  lap: "page",
}

/** Step-level keys — shared by `steps` and `setup`. */
const STEP_ALIASES = {
  cimke: "label",
  megnyit: "goto",
  kattint: "click",
  kattintCimke: "clickLabel",
  valaszt: "pick",
  kitolt: "fill",
  billentyu: "press",
  gorget: "scroll",
  fokusz: "spotlight",
  buborek: "bubble",
  buborekIdo: "bubbleHold",
  varakozas: "wait",
  elvaras: "expect",
  magyarazat: "note",
}

/** Nested objects, keyed by the (already English) field they belong to. */
const NESTED_ALIASES = {
  pace: { uresjarat: "idle", cselekves: "action", levego: "breath" },
  crop: {},
  gif: { kockahossz: "frameDuration", szelesseg: "width" },
  page: { mozgokep: "media" },
  pick: { lista: "list", tartalmaz: "contains", kizar: "excludes", benne: "within" },
  fill: { mezo: "field", ertek: "value", cimke: "label", ido: "hold" },
  scroll: { hol: "on", mennyi: "by", lepeskoz: "step", szunet: "pause", cimke: "label" },
  spotlight: { hol: "on", szoveg: "text", ido: "hold", utana: "after" },
}

/** Values that are enums, not free text. */
const VALUE_ALIASES = {
  viewport: { mobil: "mobile" },
  "page.media": { mozgokep: "media" },
}

const rename = (obj, table) => {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[table[k] ?? k] = v
  return out
}

function normaliseStep(raw) {
  const step = rename(raw, STEP_ALIASES)
  for (const [field, table] of Object.entries(NESTED_ALIASES)) {
    if (step[field] && typeof step[field] === "object") step[field] = rename(step[field], table)
  }
  return step
}

/**
 * @param {object} raw  the scenario as parsed from YAML (English or Hungarian keys)
 * @returns {object}    the same scenario with English keys only
 *
 * Unknown keys are passed through untouched — a scenario may carry fields the engine does not
 * read (the release-page generator in the host project reads `fedi`, for example). Dropping
 * them here would make an unrelated tool fail with an empty result rather than an error.
 */
export function normaliseScenario(raw) {
  const s = rename(raw, SCENARIO_ALIASES)

  for (const [field, table] of Object.entries(NESTED_ALIASES)) {
    if (s[field] && typeof s[field] === "object") s[field] = rename(s[field], table)
  }
  if (typeof s.viewport === "string") s.viewport = VALUE_ALIASES.viewport[s.viewport] ?? s.viewport
  if (s.page?.media) s.page.media = s.page.media === "gif" ? "gif" : s.page.media

  s.steps = (s.steps ?? []).map(normaliseStep)
  if (s.setup) s.setup = s.setup.map(normaliseStep)
  return s
}

/**
 * Config keys. Only one was ever Hungarian (`kornyezet`), but it is read by the host project's
 * caller, so it stays accepted.
 */
export function normaliseConfig(raw) {
  return rename(raw, { kornyezet: "environment" })
}

export const __aliasTables = { SCENARIO_ALIASES, STEP_ALIASES, NESTED_ALIASES }
