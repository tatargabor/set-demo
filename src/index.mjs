// set-demo — public API.
//
//   import { runDemo } from "set-demo"
//   await runDemo({ config, scenarioPath })
//
// The project-specific part (login, base URL, output, environment preparation) comes from
// `config` — see `set-demo.config.example.mjs`.

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { capture } from "./capture.mjs"
import { renderVideo, renderGif } from "./render.mjs"
import { buildPage } from "./page.mjs"
import { normaliseScenario, normaliseConfig } from "./scenario.mjs"

const require = createRequire(import.meta.url)
const yaml = require("js-yaml")

/**
 * @param {object} o
 * @param {object} o.config        the project's config (baseUrl, outDir, login, prepare…)
 * @param {string} o.scenarioPath  path to the scenario YAML
 * @param {object} [o.chromium]    Playwright's chromium (supplied by the caller — peer dep)
 * @returns {Promise<{ok:boolean, results:Array, mp4:string, gif:string|null, page:string}>}
 *   `gif` is non-null only if the scenario explicitly asked for it (a `gif:` block).
 */
export async function runDemo({ config, scenarioPath, chromium }) {
  if (!chromium) {
    // Playwright belongs to the CALLING project (peer dependency): that way the same version
    // and the same browser binaries run as in the project's own tests.
    //
    // ⚠ The fallback import resolves from the PACKAGE's node_modules, where the binaries are
    // typically not installed — the run then stops with a mysterious "Executable doesn't exist"
    // long after the actual cause. So we spell out what the correct call is.
    try {
      const pw = await import("@playwright/test")
      chromium = (pw.default ?? pw).chromium
    } catch {
      throw new Error(
        "No Playwright. Pass it in from the calling project:\n" +
          "  import playwright from \"@playwright/test\"\n" +
          "  await runDemo({ config, scenarioPath, chromium: playwright.chromium })"
      )
    }
  }

  const cfg = normaliseConfig(config)
  const scenario = normaliseScenario(yaml.load(fs.readFileSync(scenarioPath, "utf-8")))
  const name = path.basename(scenarioPath).replace(/\.ya?ml$/, "")
  const out = path.join(cfg.outDir, name)
  fs.mkdirSync(out, { recursive: true })

  console.log(`Scenario: ${scenario.title}`)
  console.log(`Target: ${cfg.baseUrl}\n`)

  const { results, findings, workDir, tracesDir, viewport, mobile } = await capture({
    scenario,
    config: cfg,
    chromium,
  })

  const mp4 = path.join(out, `${name}.mp4`)
  await renderVideo({ tracesDir, mp4Path: mp4, viewport, mobile, pace: scenario.pace, maxSide: scenario.maxSide })

  /**
   * ⚠ A GREEN RUN CAN STILL PRODUCE AN UNUSABLE FILE — say so, loudly.
   *
   * The walkthrough proves the FEATURE works; it proves nothing about the RECORDING. Measured
   * 2026-08-05: every step green, and the output was a **89 kB, blank white** MP4 (a secondary
   * page's recording had won the render). That root cause is fixed in `capture.mjs` — but the
   * failure MODE is not specific to it: any rendering problem produces the same shape, and
   * "all steps ✓" reads as success.
   *
   * The threshold is deliberately crude. A precise one would need to know what the scenario
   * shows; this only has to separate "a real recording" from "essentially nothing", and the
   * measured gap there is two orders of magnitude (89 kB vs 4.8–8.6 MB). A tighter bound would
   * produce false alarms on short scenarios — and an alarm nobody trusts is worse than none.
   *
   * ⚠ WHAT THIS DOES **NOT** COVER, stated so a green size check is not mistaken for proof:
   * it guards against "essentially nothing", not against "partly wrong". A recording that is
   * fine for half the steps and blank afterwards lands far above the threshold and passes
   * silently. That is a different failure class, and it stays unguarded — deliberately, since
   * catching it would mean judging CONTENT, which no file-size rule can do.
   */
  const mp4Bytes = fs.statSync(mp4).size
  const MIN_PLAUSIBLE_BYTES = 250_000
  if (mp4Bytes < MIN_PLAUSIBLE_BYTES) {
    console.log(
      `\n  ⚠ THE VIDEO IS SUSPICIOUSLY SMALL: ${Math.round(mp4Bytes / 1024)} kB. A real recording is\n` +
        `    megabytes. Open it before sending it out — a blank render looks exactly like a\n` +
        `    successful run from here. (A known cause, now fixed: a page opened by the app\n` +
        `    winning the render — see capture.mjs.)\n`
    )
  }

  /**
   * The GIF is OPT-IN — it is NOT produced by default.
   *
   * ⚠ It used to be generated unconditionally, and measurement showed **nobody read it**: both
   * the demo page and the release page embed video, and not a single scenario used the
   * `page.media: gif` switch. It costs ~0.4 s and ~1.4 MB per demo — the time is not much; the
   * problem is that the printed "GIF 1421 kB" line suggested there was a deliverable file, when
   * there was not.
   *
   * The capability STAYS, because it serves a real case: **embedded in an e-mail BODY, an
   * animated GIF is the only thing that starts by itself** — MP4 does not play there. If we
   * ever send inline mail, a `gif:` block switches it back on.
   */
  const wantGif = !!scenario.gif || scenario.page?.media === "gif"
  const gifPath = path.join(out, `${name}.gif`)
  const gif = wantGif ? gifPath : null
  if (wantGif) renderGif({ mp4Path: mp4, gifPath: gif, workDir, viewport, crop: scenario.crop, gif: scenario.gif })
  // ⚠ DELETE a PREVIOUS run's GIF if it is no longer wanted. Otherwise a stale file stays in
  // the directory and the next person may send it out — and that recording would show an OLD
  // state. Silent staleness is indistinguishable from valid output when seen from outside.
  else if (fs.existsSync(gifPath)) fs.rmSync(gifPath)

  const pagePath = path.join(out, `${name}.html`)
  fs.writeFileSync(
    pagePath,
    buildPage({
      scenario,
      results,
      mp4Path: mp4,
      gifPath: gif,
      environment: cfg.environment,
      locale: cfg.locale,
      strings: cfg.pageStrings,
    })
  )

  fs.rmSync(workDir, { recursive: true, force: true })

  const kb = (f) => `${Math.round(fs.statSync(f).size / 1024)} kB`
  console.log("")
  if (gif) console.log(`  GIF   ${kb(gif)}  ${gif}`)
  console.log(`  MP4   ${kb(mp4)}  ${mp4}`)
  console.log(`  page  ${kb(pagePath)}  ${pagePath}`)

  /**
   * FINDINGS — what the recording learned, it also writes down.
   *
   * The demo is the only tool in the chain that walks the real UI, on real data, DURING
   * INTERACTION. The knowledge gained that way exists nowhere else:
   *
   *   • a static UI map states in its own header that regions appearing after interaction
   *     (detail panes, action bars, search results, menus) are not in it — the recording is
   *     walking exactly through those;
   *   • a failed step is not only the demo's problem: either the anchor does not exist, or it
   *     exists but is not visible AT THAT MOMENT — and a static list cannot tell them apart.
   *
   * ⚠ This is DATA, not a verdict. Whether a gap belongs to the map, the spec or the UI is for
   * a human to decide.
   */
  const seen = new Set()
  const findingsFile = {
    scenario: name,
    title: scenario.title,
    environment: cfg.environment,
    steps: (findings ?? []).map((f) => {
      const fresh = (f.anchors ?? []).filter((a) => !seen.has(a))
      for (const a of f.anchors ?? []) seen.add(a)
      return { label: f.label, status: f.status, newAnchors: fresh }
    }),
    allAnchors: [...seen].sort(),
  }
  fs.writeFileSync(path.join(out, "findings.json"), JSON.stringify(findingsFile, null, 2))
  // ⚠ The file was called `leletek.json` before the package switched to English. Remove the
  // old one — for the same reason the stale GIF is removed above: a leftover data file next to
  // the current one looks like data, but describes an OLDER run, and nothing distinguishes the
  // two from the outside.
  const legacyFindings = path.join(out, "leletek.json")
  if (fs.existsSync(legacyFindings)) fs.rmSync(legacyFindings)

  const failed = results.filter((r) => r.status === "failed")
  if (failed.length) {
    console.error(`\n${failed.length} step expectation(s) NOT met — the demo cannot be sent out like this.`)
  } else {
    console.log(`\n${results.length} steps, every expectation met.`)
  }

  return { ok: failed.length === 0, results, mp4, gif, page: pagePath }
}

export { capture } from "./capture.mjs"
export { renderVideo, renderGif, videoSize } from "./render.mjs"
export { buildPage, pageStrings } from "./page.mjs"
export { overlayScript, escapeHtml } from "./overlay.mjs"
export { normaliseScenario, normaliseConfig } from "./scenario.mjs"
