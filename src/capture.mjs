// The recording: scenario steps executed against a real UI, with a Playwright trace.
//
// ⚠ A scenario IS a walkthrough test: every step may carry an `expect`, and if one is not
// met the run fails LOUDLY — no pretty video of a broken feature.
//
// ⚠ The project-specific part is NOT here: base URL, login, output directory and environment
// preparation all come from the caller's `config`. See `set-demo.config.example.mjs`.

import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { overlayScript, escapeHtml as esc } from "./overlay.mjs"

const MOBILE_VIEWPORT = { width: 390, height: 844 }
const DESKTOP_VIEWPORT = { width: 1280, height: 800 }

/**
 * Date substitution in scenarios: `{{today}}` and `{{today+3}}` / `{{today-1}}` → ISO day.
 * The Hungarian `{{ma}}` form is still accepted (see `scenario.mjs` for why aliases exist).
 *
 * Why this is needed: a demo often has to type TODAY's date (scheduling, deadlines) and YAML
 * cannot compute. With a hardcoded date the scenario breaks SILENTLY the next day — the
 * recording still completes, it just shows an empty screen.
 */
export function resolveDate(value, now = new Date()) {
  if (typeof value !== "string") return value
  return value.replace(/\{\{\s*(?:today|ma)\s*([+-]\s*\d+)?\s*\}\}/g, (_, offset) => {
    const d = new Date(now)
    if (offset) d.setDate(d.getDate() + Number(offset.replace(/\s+/g, "")))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  })
}

/**
 * Execute ONE step. The same vocabulary serves both the RECORDING and the SETUP phase —
 * deliberately, in a single implementation.
 *
 * ⚠ Two hand-maintained step interpreters drift apart sooner or later, and the drift goes the
 * wrong way: setup would quietly do something other than what the scenario author learned
 * from the recording steps. `ctx.recording` switches off captions, spotlight and viewer
 * pauses — the ACTIONS stay identical.
 */
async function executeStep({ page, step, ctx }) {
  const { recording, caption, spotlight, spotlightOff, action, actionOff, scenario, config, label } = ctx

  if (step.goto) {
    await page.goto(`${config.baseUrl}${step.goto}`, { waitUntil: "networkidle", timeout: 45000 })
  }
  // The caption is pushed both BEFORE and AFTER the action: a click may trigger navigation,
  // which takes the injected bar down with the DOM.
  if (recording) await caption(label, step.note)

  // ⚠ ORDER MATTERS: bubble BEFORE the click (where are we going), spotlight AFTER it (what
  // to look at in the result). Reversed, the spotlight would wait for an element that the
  // click itself is about to create.
  const bubbleTarget = recording && step.bubble ? step.click || step.scroll?.on : null
  if (bubbleTarget && (await spotlight(bubbleTarget, step.bubble))) {
    await page.waitForTimeout(step.bubbleHold ?? 1900)
  }

  if (step.click) {
    const target = page.locator(step.click).first()
    // The ripple is drawn by recast from the trace (with exact timing) — we only add the
    // LABEL next to it, without a ring: two circles drawn on top of each other would confuse.
    await action(target, "click", step.clickLabel, false)
    await target.click()
    await actionOff()
  }

  // Criterion-based choice from a list. Without it the demo shows "the first row", i.e. A
  // DIFFERENT ONE EVERY RUN — and the explanation may drift away from the picture. The chosen
  // instance is PRINTED: after a silent choice, a difference in the next run is inexplicable.
  if (step.pick) {
    let candidates = page.locator(step.pick.list)
    for (const t of step.pick.contains ?? []) candidates = candidates.filter({ hasText: t })
    for (const t of step.pick.excludes ?? []) candidates = candidates.filter({ hasNotText: t })
    const count = await candidates.count()
    if (count === 0) {
      throw new Error(
        `No element matches the criterion: ${JSON.stringify(step.pick)} — ` +
          `the demo must not show an arbitrary instance instead`
      )
    }
    const chosen = candidates.first()
    const text = ((await chosen.innerText()) || "").split("\n").slice(0, 2).join(" · ").slice(0, 90)
    console.log(`      picked (of ${count}): ${text}`)

    // ⚠ The CHOICE and the CLICK are often two DIFFERENT elements: the criterion makes sense
    // on the card/row ("do not show a run with 0 main items"), while the action lives inside
    // a button. Without `within`, the criterion would have to go on the button — where the
    // distinguishing text is not present — so the demo either shows the wrong instance, or
    // the author hardcodes a specific id.
    const target = step.pick.within ? chosen.locator(step.pick.within).first() : chosen
    if (step.pick.within && (await target.count()) === 0) {
      throw new Error(
        `The chosen element contains no "${step.pick.within}" — the criterion found the right ` +
          `row, but the target of the action is missing from it`
      )
    }
    await action(target, "click", step.clickLabel ?? ((await target.innerText().catch(() => "")) || "").trim().split("\n")[0], false)
    await target.click()
    await actionOff()
  }

  if (bubbleTarget && !step.spotlight) await spotlightOff()

  if (recording && step.spotlight) {
    if (step.click) await page.waitForTimeout(step.spotlight.after ?? 900)
    if (await spotlight(step.spotlight.on, step.spotlight.text)) {
      await page.waitForTimeout(step.spotlight.hold ?? 1800)
    }
  }

  if (step.fill) {
    // ⚠ Typing leaves NO TRACE on the recording: the field's value simply appears, as if it
    // had happened by itself. The ring + the typed value show WHAT is happening — `clickEffect`
    // cannot reach here, because it only sees real mouse clicks in the trace.
    const field = page.locator(step.fill.field).first()
    const value = resolveDate(step.fill.value)
    await action(field, "type", step.fill.label ?? value)
    await page.fill(step.fill.field, value)
    if (recording) await page.waitForTimeout(step.fill.hold ?? 900)
    await actionOff()
  }

  if (step.press) {
    // A key press acts on the focused element — so does the marker. If there is no focus (or
    // it is not measurable), the label still goes out: a silent key press is the worst case,
    // because the screen changes on its own.
    await action(page.locator(":focus").first(), "key", step.press)
    await page.keyboard.press(step.press)
    if (recording) await page.waitForTimeout(700)
    await actionOff()
  }

  if (step.scroll) {
    // Move the mouse over the element so the INNER panel scrolls, not the page.
    const target = page.locator(step.scroll.on).first()
    await target.waitFor({ state: "visible", timeout: 10000 })
    await action(target, "scroll", step.scroll.label ?? "", false)
    await target.hover()
    // Small steps + pauses: the scroll must be FOLLOWABLE for the viewer, not a jump.
    const total = step.scroll.by ?? 400
    const stride = step.scroll.step ?? 45
    const pause = step.scroll.pause ?? 170
    const ticks = Math.max(1, Math.round(Math.abs(total) / stride))
    for (let i = 0; i < ticks; i++) {
      await page.mouse.wheel(0, total / ticks)
      await page.waitForTimeout(pause)
    }
    await actionOff()
  }

  if (recording) {
    await caption(label, step.note)
    await page.waitForTimeout(step.wait ?? 2500)
    if (step.spotlight) await spotlightOff()
  } else if (step.wait) {
    // In setup we only wait when the step EXPLICITLY asks for it (a reload after saving) —
    // viewer pacing is pure waste there.
    await page.waitForTimeout(Math.min(step.wait, 3000))
  }

  // The EXPECTATION is what makes the demo evidence. Omitting it is allowed (e.g. plain
  // navigation), but then that step proves nothing — the report flags it separately.
  if (step.expect) {
    await page.locator(step.expect).first().waitFor({ state: "visible", timeout: 10000 })
    return "ok"
  }
  return "no-expectation"
}

/** Run a sequence of steps, with a per-step result. Never throws — writes into the result. */
async function runSteps({ page, steps, ctx, after }) {
  const results = []
  for (const [i, step] of (steps || []).entries()) {
    const label = step.label || `step ${i + 1}`
    let status
    try {
      status = await executeStep({ page, step, ctx: { ...ctx, label } })
      results.push({ label, status, note: step.note })
      console.log(`  ${status === "ok" ? "✓" : "·"} ${label}`)
    } catch (e) {
      status = "failed"
      results.push({ label, status, error: e.message.split("\n")[0].slice(0, 140) })
      console.log(`  ✗ ${label}\n      ${e.message.split("\n")[0].slice(0, 140)}`)
    }
    // ⚠ Findings are collected AFTER a FAILED step too — that is the most valuable moment:
    // it is where you learn whether the missing anchor does not exist, or is just not visible
    // at that point.
    if (after) await after(step, label, status)
  }
  return results
}

/**
 * SETUP — the demo PRODUCES what it is about to show.
 *
 * Why it is a separate phase, and why it does NOT end up on the recording:
 *
 * 1. **A feature may have no live data at all.** Measured on a production ERP: of 310 orders,
 *    ZERO scheduled runs, zero driver assignments, zero confirmations and ZERO users with the
 *    driver capability — one day after release the delivery chain was unreachable. "Pick a
 *    good instance" cannot work in principle there.
 * 2. **Production often happens in a DIFFERENT viewport than presentation.** An operator
 *    schedules on a desktop screen; the demo shows the driver's PHONE. The two do not fit in
 *    one recording: the viewport is a property of the recording.
 * 3. **Setup is not part of the story.** The viewer wants the feature, not how the demo
 *    scraped together its own data.
 *
 * ⚠ A failing setup ABORTS. Otherwise the recording would run against missing data and produce
 * a nice video of an EMPTY screen — the silent-failure class: from the outside it looks exactly
 * like success.
 */
async function runSetup({ scenario, config, browser }) {
  const viewport = scenario.setupViewport || DESKTOP_VIEWPORT
  const ctx = await browser.newContext({ viewport, locale: config.locale || "en-US" })
  if (config.prepare) await config.prepare(ctx, { mobile: false, viewport })
  const page = await ctx.newPage()
  if (config.login) await config.login(ctx, { baseUrl: config.baseUrl, page })

  console.log("  Setup (not recorded):")
  const results = await runSteps({
    page,
    steps: scenario.setup,
    // Setup is not recorded, so the visual markers are no-ops here — but the FUNCTIONS must
    // exist, otherwise the shared step interpreter would fail on them.
    ctx: { recording: false, action: async () => {}, actionOff: async () => {}, scenario, config },
  })
  await ctx.close()

  const failed = results.filter((r) => r.status === "failed")
  if (failed.length) {
    throw new Error(
      `${failed.length} setup step(s) failed (${failed.map((f) => f.label).join(", ")}) — ` +
        `the data to be shown does NOT come into existence, so the recording would capture an ` +
        `empty screen. Not starting it.`
    )
  }
  console.log("")
  return results
}

export async function capture({ scenario, config, chromium }) {
  // `viewport: mobile` — recording a phone screen in a desktop viewport is misleading: it
  // would show a layout the user never sees.
  const mobile = scenario.viewport === "mobile" || scenario.mobile === true
  const viewport = mobile ? MOBILE_VIEWPORT : scenario.viewport || DESKTOP_VIEWPORT

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "set-demo-"))
  const tracesDir = path.join(workDir, "test-results", "demo")
  fs.mkdirSync(tracesDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })

  if (scenario.setup?.length) {
    try {
      await runSetup({ scenario, config, browser })
    } catch (e) {
      await browser.close()
      throw e
    }
  }

  const ctx = await browser.newContext({
    viewport,
    locale: config.locale || "en-US",
    // Touch emulation: without it the UI runs on the mouse branch (hover states, a different
    // breakpoint) and the recording does not show what the user sees on their phone.
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 3 : 1,
    recordVideo: { dir: tracesDir, size: viewport },
  })

  if (scenario.captions !== false) {
    await ctx.addInitScript(
      overlayScript({
        mobile,
        leftOffset: scenario.crop?.x ?? 0,
        rightOffset: scenario.crop ? Math.max(0, viewport.width - scenario.crop.x - scenario.crop.w) : 0,
      })
    )
  }

  // Project-specific environment preparation (init scripts, localStorage, feature flags).
  // Typical use: removing visual noise that is not about the feature being shown.
  // ⚠ If you use this, it is HIDING, not fixing — file the underlying bug separately.
  if (config.prepare) await config.prepare(ctx, { mobile, viewport })

  await ctx.tracing.start({ screenshots: true, snapshots: true, sources: false })
  const page = await ctx.newPage()

  if (config.login) await config.login(ctx, { baseUrl: config.baseUrl, page })

  const caption = async (title, text) => {
    if (scenario.captions === false) return
    await page.evaluate(([t, x]) => window.__demoCaption?.(t, x), [esc(title), esc(text)]).catch(() => {})
  }

  // Spotlight: a frame around the area + a dimmed background + a short line of text.
  async function spotlight(sel, text) {
    const target = page.locator(sel).first()
    await target.waitFor({ state: "visible", timeout: 10000 })
    // ⚠ If the area to highlight is off-screen, WE SCROLL TO IT — otherwise the frame lands
    // outside the viewport and NOTHING IS VISIBLE on the recording. This is insidious, because
    // Playwright's `hover()` scrolls by itself: the same selector works on the scroll path and
    // silently does not on the highlight path.
    await target.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(350)
    const b = await target.boundingBox()

    // ⚠ Silent failure is the worst outcome: the recording completes without the highlight,
    // and you only find out from the finished video. So every miss is LOUD.
    if (!b) {
      console.log(`      ⚠ no highlight: "${sel}" has no bounding box`)
      return false
    }
    if (b.width < 8 || b.height < 8) {
      console.log(`      ⚠ no highlight: "${sel}" is ${Math.round(b.width)}×${Math.round(b.height)} px`)
      return false
    }
    const p = { x: Math.max(0, b.x), y: Math.max(0, b.y) }
    const w = Math.min(b.x + b.width, viewport.width) - p.x
    const h = Math.min(b.y + b.height, viewport.height) - p.y
    if (w < 8 || h < 8) {
      console.log(`      ⚠ no highlight: "${sel}" is outside the visible area`)
      return false
    }
    if (h > viewport.height * 0.94 && w > viewport.width * 0.94) {
      console.log(`      ⚠ the highlight covers almost the whole screen ("${sel}") — use a narrower selector`)
    }
    await page.evaluate(([bb, t]) => window.__demoSpotlight?.(bb, t), [{ x: p.x, y: p.y, w, h }, esc(text)])
    console.log(`      highlighted: ${Math.round(w)}×${Math.round(h)} px @${Math.round(p.x)},${Math.round(p.y)}`)
    return true
  }

  /**
   * ACTION marker: a ring + a label saying WHAT we are doing — not just where.
   *
   * `withRing: false` is for clicks: there the ripple is drawn by `clickEffect` from the
   * trace, with exact timing, and two circles on top of each other would only confuse.
   *
   * ⚠ The `kind` is a WORD, not a pictogram. Headless Chromium's font set lacks most symbol
   * glyphs: `⌨` (U+2328) was measured rendering as `=` on the recording — i.e. the marker whose
   * whole job is to aid UNDERSTANDING showed a meaningless character. Without a fallback font
   * this only surfaces on the finished video.
   *
   * ⚠ A miss here is NOT loud, and that is deliberate: the marker is decoration, not evidence.
   * If the target happens not to be measurable (an unfocused key press, a vanishing element),
   * the step should carry on — for the spotlight it is the other way round, because there a
   * miss means the viewer SEES NOTHING of what the caption is talking about.
   */
  const action = async (target, kind, text, withRing = true) => {
    if (!text && !kind) return
    try {
      const b = await target.boundingBox({ timeout: 2000 })
      if (!b) return
      const short = String(text ?? "").slice(0, 48)
      await page.evaluate(
        ([bb, k, t, r]) => window.__demoAction?.(bb, k, t, r),
        [{ x: b.x, y: b.y, w: b.width, h: b.height }, esc(kind), esc(short), withRing]
      )
      await page.waitForTimeout(650)
    } catch {
      /* the marker may be skipped — the step may not */
    }
  }
  const actionOff = async () => {
    await page.evaluate(() => window.__demoAction?.(null)).catch(() => {})
  }

  // Always follow a highlight with a bright stretch: if the dimming is continuous, the viewer
  // gets used to it and the screen just looks dark throughout.
  const spotlightOff = async () => {
    await page.evaluate(() => window.__demoSpotlight?.(null)).catch(() => {})
    await page.waitForTimeout(scenario.pace?.breath ?? 900)
  }

  /**
   * FINDINGS — whatever the recording learns, it also writes down.
   *
   * The demo is the only tool in the chain that walks the real UI, on real data, DURING
   * INTERACTION. What it learns that way exists nowhere else:
   *
   *   • a static UI map states in its own header that regions appearing after interaction
   *     (detail panes, action bars, search results, menus) are not in it — while the recording
   *     is walking exactly through those;
   *   • a failed step is not only the demo's problem: either the anchor does not exist, or it
   *     exists but is not visible AT THAT MOMENT — and a static list cannot tell the two apart.
   *
   * So per step we record which `data-testid`s were PRESENT on the page at that moment. The
   * difference between two steps = the UI that appears after interaction, i.e. precisely the
   * blind spot of the static map.
   */
  const findings = []
  const visibleAnchors = async () => {
    try {
      return await page.evaluate(() =>
        [...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid"))
      )
    } catch {
      return []
    }
  }

  const results = await runSteps({
    page,
    steps: scenario.steps,
    ctx: { recording: true, caption, spotlight, spotlightOff, action, actionOff, scenario, config },
    after: async (step, label, status) => {
      findings.push({ label, status, anchors: await visibleAnchors() })
    },
  })

  await ctx.tracing.stop({ path: path.join(tracesDir, "trace.zip") })

  // ⚠ WHICH page's video gets rendered — the ONE-TAB assumption, measured and broken.
  //
  // `Recast.from(dir)` finds the source video by taking the FIRST `*.webm` in readdir order
  // (`pipeline/executor.js` → `findSourceVideo`). That is correct while a run has exactly one
  // page. It stops being correct the moment the app opens a tab: Playwright then writes a
  // SECOND `page@<hash>.webm`, and readdir order decides which one the render uses.
  //
  // Measured 2026-08-05 (wpc-pont, quote issuing → `window.open` for the generated PDF): the
  // run reported every step green, and produced an **89 kB, 37-second, blank white** MP4 with
  // only the cursor overlay on it — the popup tab's 3 kB video had won. The failure is silent
  // in the worst way: the walkthrough passes, so nothing signals that the artifact is unusable.
  //
  // `page.video().path()` names the main page's file EXACTLY, so this needs no heuristic (a
  // "largest file wins" rule would be a guess, and would break on a long-lived popup). We keep
  // that file and remove the other recordings before the render runs.
  const mainVideo = await page.video()?.path().catch(() => null)
  await ctx.close() // the video files are only finalised on close
  if (mainVideo) {
    for (const dir of [tracesDir]) {
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith(".webm")) continue
        const full = path.join(dir, file)
        if (path.resolve(full) === path.resolve(mainVideo)) continue
        fs.rmSync(full, { force: true })
        console.log(`  discarded a secondary page recording: ${file} (the app opened a tab)`)
      }
    }
  }
  await browser.close()

  return { results, findings, workDir, tracesDir: path.join(workDir, "test-results"), viewport, mobile }
}
