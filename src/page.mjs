// Companion page: ONE self-contained HTML file with the moving image embedded as base64 — so
// that opening it as an e-mail attachment just works, with no external references.

import fs from "node:fs"
import { escapeHtml as esc } from "./overlay.mjs"

/**
 * The PACKAGE is English; the PAGE IT PRODUCES is not necessarily.
 *
 * The demo is sent to whoever uses the system, so its boilerplate has to be in their language —
 * while the tooling, its docs and its errors stay English so the package is usable by anyone.
 * The switch is `config.locale`, which the caller already sets for the browser context, so a
 * Hungarian project needs no extra configuration to get a Hungarian page.
 *
 * For a language not shipped here, pass `config.pageStrings` — that beats waiting for a release.
 */
const STRINGS = {
  en: {
    lang: "en",
    defaultSubtitle: "New feature",
    footer: (env) =>
      `Recorded on the ${env} system, against the real UI. ` +
      `A ✓ means the step's expectation was met during the recording.`,
  },
  hu: {
    lang: "hu",
    defaultSubtitle: "Új funkció",
    footer: (env) =>
      `A felvétel a ${env} rendszeren készült, valós felületen. ` +
      `A ✓ azt jelenti, hogy a lépés elvárása a felvétel közben teljesült.`,
  },
}

export const pageStrings = (locale, override) =>
  override ?? STRINGS[String(locale ?? "en").slice(0, 2).toLowerCase()] ?? STRINGS.en

/**
 * ⚠ VIDEO by default, not GIF. A GIF stores every frame as a full image, which makes smooth
 * motion (scrolling) unaffordable in it: measured on the same 7-step demo, GIF 1.2 MB *jerky*
 * vs MP4 1.3 MB *smooth at 25 fps*. The GIF file is still produced on request — embedded in an
 * e-mail body it is the only thing that plays by itself.
 */
export function buildPage({ scenario, results, mp4Path, gifPath, environment = "test", locale, strings }) {
  const t = pageStrings(locale, strings)

  // The GIF is opt-in (see index.mjs). If someone asks for `media: gif` but the file is not
  // there, that is a PROGRAMMING ERROR — silently falling back to video is worse: a page meant
  // for an e-mail body would quietly get something that does not play there.
  const media = scenario.page?.media === "gif" ? "gif" : "video"
  if (media === "gif" && !gifPath) {
    throw new Error("The page asks for a GIF (page.media: gif) but no GIF was produced — add a `gif:` block to the scenario.")
  }
  const b64 = fs.readFileSync(media === "gif" ? gifPath : mp4Path).toString("base64")
  const mediaTag =
    media === "gif"
      ? `<img src="data:image/gif;base64,${b64}" alt="${esc(scenario.title)}">`
      : `<video src="data:video/mp4;base64,${b64}" autoplay loop muted playsinline controls></video>`

  const rows = results
    .map((r) => {
      const mark = r.status === "ok" ? "✓" : r.status === "failed" ? "✗" : "·"
      const note = r.note ? `<div class="n">${esc(r.note)}</div>` : ""
      const err = r.error ? `<div class="e">${esc(r.error)}</div>` : ""
      return `<li class="${r.status}"><span class="m">${mark}</span><div><b>${esc(r.label)}</b>${note}${err}</div></li>`
    })
    .join("\n")

  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(scenario.title)}</title><style>
:root{color-scheme:light dark}
body{font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:2rem 1rem;
  background:#fafafa;color:#18181b}
@media (prefers-color-scheme:dark){body{background:#18181b;color:#e4e4e7}
  .card{background:#27272a!important;border-color:#3f3f46!important}}
.card{max-width:980px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;
  padding:1.75rem;box-shadow:0 1px 3px rgba(0,0,0,.06)}
h1{font-size:1.5rem;margin:0 0 .25rem}
.subtitle{color:#71717a;margin:0 0 1.5rem;font-size:.9rem}
.intro{margin:0 0 1.5rem}
/* ⚠ max-height, not width:100%. A PORTRAIT (mobile) recording stretched to the card width
   becomes absurdly tall: 888×1920 at a 980px card is 2119px high — the viewer scrolls past
   the video instead of watching it. Capping the height and letting the width follow keeps
   both orientations right: a landscape recording is still limited by the card width. */
img,video{max-width:100%;max-height:78vh;width:auto;height:auto;margin:0 auto;
  border:1px solid #e4e4e7;border-radius:8px;display:block;background:#000}
ol{list-style:none;padding:0;margin:1.5rem 0 0}
li{display:flex;gap:.75rem;padding:.6rem 0;border-top:1px solid #e4e4e7}
.m{font-weight:700;width:1.2rem;flex:none}
li.ok .m{color:#15803d} li.failed .m{color:#b91c1c} li.no-expectation .m{color:#a1a1aa}
.n{color:#71717a;font-size:.9rem} .e{color:#b91c1c;font-size:.85rem;font-family:ui-monospace,monospace}
footer{margin-top:1.5rem;padding-top:1rem;border-top:1px solid #e4e4e7;color:#71717a;font-size:.8rem}
</style></head><body><div class="card">
<h1>${esc(scenario.title)}</h1>
<p class="subtitle">${esc(scenario.subtitle || t.defaultSubtitle)}${scenario.version ? ` — ${esc(scenario.version)}` : ""}</p>
${scenario.intro ? `<p class="intro">${esc(scenario.intro)}</p>` : ""}
${mediaTag}
<ol>${rows}</ol>
<footer>${esc(t.footer(environment))}</footer>
</div></body></html>`
}
