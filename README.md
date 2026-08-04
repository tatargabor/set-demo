# set-demo

**Feature demos recorded from a real web application.** From one scenario YAML it produces an
**MP4 and a self-contained HTML page** — with a cursor, a spotlight and a caption bar — and the
recording **is a walkthrough test**: every step may carry an expectation, and if one is not met
the run fails loudly. (GIF only on request — see below.)

> **Why:** release notes alone do not get a new feature across, and nobody finds "what changed"
> inside a large manual. One feature, one page, one moving image — sendable on its own.

## Install

```bash
npm i -D set-demo
```

System dependency: **`ffmpeg` and `ffprobe`** on the PATH. Playwright belongs to the calling
project (peer dependency) — so the same version and the same browser binaries run as in the
project's own tests.

## Usage

1. Copy `set-demo.config.example.mjs` into your project root as `set-demo.config.mjs`, and fill
   in the login and the base URL.
2. Write a scenario (`docs/demos/example.yaml` — see `examples/`).
3. Run it:

```bash
npx set-demo docs/demos/example.yaml
```

Or from code:

```js
import { runDemo } from "set-demo"
import config from "./set-demo.config.mjs"

const { ok, page } = await runDemo({ config, scenarioPath: "docs/demos/example.yaml" })
```

## What it does

| | |
|---|---|
| **output** | **MP4 + a self-contained HTML page**. GIF only on request (a `gif:` block) — see below |
| **cursor + click ripple** | from the Playwright trace, via `playwright-recast` |
| **action marker** | *what* we are doing, not just where: a ring + a label for typing, key presses, scrolling, clicks |
| **spotlight** | highlight any area: frame + dimmed background + a short line of text |
| **caption bar** | injected into the page, so it moves together with the pace control |
| **pace** | speed up idle time, keep actions at normal speed; "breathing room" between highlights |
| **mobile viewport** | `viewport: mobile` → 390×844, touch emulation, portrait resolution, no cursor |
| **criterion-based choice** | the right instance from a list, printed — not "the first row" |
| **setup** | `setup:` — the demo PRODUCES what it shows; separate context, not recorded |
| **expectation gate** | the demo is only produced if the path being shown is actually walkable |

### The GIF is OPT-IN — only MP4 by default

Both the demo page and the release page embed **video**. Measured on the same 7-step demo:
**GIF 1.2 MB, jerky** vs **MP4 1.3 MB, smooth at 25 fps** — a GIF stores every frame as a full
image, which is why it has to be sampled sparsely, and why scrolling jumps in it.

The GIF used to be produced unconditionally, and **nobody read it**: it costs ~0.4 s and ~1.4 MB
per demo, while the printed "GIF 1421 kB" line suggested there was a deliverable file.

The capability stays, because it serves a real case: **embedded in an e-mail BODY, an animated
GIF is the only thing that starts by itself** (MP4 does not play there). To switch it back on:

```yaml
gif: { fps: 1.6, frameDuration: 0.9, width: 900 }   # → the GIF is produced
page: { media: gif }                                # → the PAGE embeds the GIF too
```

### Two markers, two meanings — do not conflate them

| marker | colour | what it says |
|---|---|---|
| **spotlight** (frame + dimmed background + bubble) | teal | *"look here"* — where the thing the caption talks about is |
| **action marker** (ring + monospace label) | rose | *"this is what I'm doing"* — `type Jane Doe`, `key Enter`, `click Logistics` |

The `clickEffect` ripple comes from the trace, so it only shows **real mouse clicks**. Typing,
key presses and scrolling otherwise leave **no trace** on the recording: the field value simply
appears, as if it had happened by itself — the viewer sees the *place*, not the *action*. For
clicks the action marker therefore adds only a label, no ring (two circles drawn on top of each
other would be distracting).

⚠ The label prefix is a **word, not a pictogram**: headless Chromium's font set lacks most symbol
glyphs — `⌨` was measured rendering as `=`, i.e. the marker whose whole job is to aid
understanding showed a meaningless character. This only surfaces on the finished video.

### `setup:` — when the data to be shown does not exist

The same step vocabulary, but in a separate browser context, on a **desktop** viewport, without
captions or spotlight. It solves two things the recording cannot:

- **the feature is not in use**, so there is no "good instance" to choose from. Measured on a
  production ERP: 310 orders, of which **0** scheduled runs and **0** eligible users — the
  freshly released delivery chain had never run;
- **production happens in a DIFFERENT viewport** than presentation (the operator schedules on a
  desktop screen, the driver sees it on a phone) — the two do not fit in one recording, because
  the viewport is a property of the recording.

⚠ A failing setup **aborts**: otherwise a nice video would be produced of an empty screen, which
from the outside looks exactly like success.

```yaml
setup:
  - label: "Pick a run"
    goto: /orders
    pick:
      list: "button[data-testid^='order-']"
      contains: ["In delivery"]
      excludes: ["unassigned"]          # → the run is repeatable: always a fresh instance
    expect: "[data-testid='order-panel']"
  - label: "Schedule for today"
    fill: { field: "[data-testid='input-planned-delivery-date']", value: "{{today}}" }
  - label: "Save"
    click: "[data-testid='btn-save-schedule']"
    expect: "text=Schedule saved"
```

**`{{today}}` / `{{today+3}}` / `{{today-1}}`** resolve to the day of the run. With a hardcoded
date the scenario breaks **silently** the next day: the recording completes, it just shows
nothing.

**`within:`** — the criterion makes sense on the ROW, the click belongs on a button inside it:

```yaml
pick:
  list: "[data-testid^='delivery-card-']"
  excludes: ["/ 0 items"]                    # do not show an empty load
  within: "button[data-testid^='btn-details-']"
```

## Field names — English, with Hungarian aliases

The engine was extracted from a Hungarian project, so the original scenario schema used
Hungarian field names. **English is the schema**; the Hungarian names are still accepted as
aliases, resolved once at the boundary (`src/scenario.mjs`) so that nothing downstream ever sees
two spellings.

| English | Hungarian alias | | English | Hungarian alias |
|---|---|---|---|---|
| `title` | `cim` | | `label` | `cimke` |
| `subtitle` | `alcim` | | `goto` | `megnyit` |
| `version` | `verzio` | | `click` | `kattint` |
| `intro` | `bevezeto` | | `pick` | `valaszt` |
| `viewport` | `nezet` | | `fill` | `kitolt` |
| `crop` | `vago` | | `press` | `billentyu` |
| `pace` | `tempo` | | `scroll` | `gorget` |
| `captions` | `felirat` | | `spotlight` | `fokusz` |
| `steps` | `lepesek` | | `bubble` | `buborek` |
| `setup` | `elokeszites` | | `wait` | `varakozas` |
| `page` | `lap` | | `expect` | `elvaras` |
| `maxSide` | `maxOldal` | | `note` | `magyarazat` |

Existing recordings keep working: a recording is evidence, and invalidating it because a key was
renamed would throw away the proof, not improve it.

## The language of the generated page

The package is English; **the page it produces is not necessarily**. The demo goes to whoever
uses the system, so its boilerplate follows `config.locale` — English and Hungarian ship with
the package. For any other language pass `config.pageStrings`; waiting for a release to add a
locale would be the wrong dependency.

## Three traps the engine already handles

1. **`playwright-recast`'s `highlight()`/`markClick()` helpers are silently ineffective**
   outside the Playwright test runner (they write a `test.step` annotation and, without `_step`,
   just `return`). That is why set-demo injects its own layer.
2. **recast renders into 1920×1080** unless given a `resolution` — which stretches a portrait
   recording horizontally. Converting the crop then needs a **separate scale factor per axis**
   if the viewport's aspect differs from the render's.
3. **A highlight can silently go missing** when the target is outside the viewport: Playwright's
   `hover()` scrolls by itself, `boundingBox()` does not. The engine scrolls there, and prints
   every highlight.

## Known debt — stated plainly

- **No tests.** The engine is proven on a single real system today; it needs a self-test.
- **GIF size is not optimised** — ~70–85 kB per frame on a dense UI. The crop (`crop`) is the
  most effective lever. (It is not produced by default anyway; opt-in.)

## Licence

MIT
