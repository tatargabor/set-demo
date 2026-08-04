// Rendering: Playwright trace → MP4 (cursor, tap, pace) → cropped GIF.
//
// The cursor, the click ripple and the pace control come from `playwright-recast`, out of the
// trace. Do NOT write your own overlay for those: a measured experiment showed the home-grown
// version did the same thing, only worse.

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { Recast } from "playwright-recast"

const even = (n) => Math.max(2, Math.round(n / 2) * 2)

/**
 * @param {object} o
 * @param {string} o.tracesDir  the `test-results` directory (trace.zip + .webm)
 * @param {string} o.mp4Path    the output MP4
 * @param {{width:number,height:number}} o.viewport  the recording viewport
 * @param {boolean} o.mobile
 * @param {{idle?:number, action?:number}} [o.pace]
 * @param {number} [o.maxSide=1920]  cap for the longer side of the rendered image
 */
export async function renderVideo({ tracesDir, mp4Path, viewport, mobile, pace, maxSide }) {
  let pipeline = Recast.from(tracesDir)
    .parse()
    .speedUp({ duringIdle: pace?.idle ?? 2.5, duringUserAction: pace?.action ?? 1.0 })

  // ⚠ There is NO mouse pointer on mobile — a cursor arrow would be a lie there: it would show
  // something on the phone screen that does not exist in reality. The tap ripple, on the other
  // hand, is exactly the right marker: it shows where the finger touched the screen.
  if (!mobile) pipeline = pipeline.cursorOverlay()
  pipeline = pipeline.clickEffect()

  // ⚠ `resolution` is MANDATORY when the viewport is not 16:9: recast renders into 1920×1080 by
  // default and STRETCHES a portrait (mobile) recording horizontally — measured: the text came
  // out unreadably wide.
  //
  // ⚠⚠ The scale factor is NOT a constant. With a fixed 3×, desktop 1280×800 becomes 3840×2400
  // — four times the pixels of the previous 1920×1080, and a measured THREEFOLD file size
  // (2 MB → 6 MB) for zero benefit. Instead we keep the viewport's ASPECT and cap the longer
  // side: that yields ~1.5× on desktop and ~2.3× on portrait mobile, by itself.
  const longer = Math.max(viewport.width, viewport.height)
  const scale = Math.max(1, (maxSide ?? 1920) / longer)
  await pipeline
    .render({
      format: "mp4",
      resolution: { width: even(viewport.width * scale), height: even(viewport.height * scale) },
    })
    .toFile(mp4Path)
}

/** The rendered video's actual resolution — the crop conversion is derived from this. */
export function videoSize(mp4Path) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "json", mp4Path,
  ]).toString()
  return JSON.parse(out).streams[0]
}

/**
 * MP4 → GIF, with an optional crop.
 *
 * ⚠ In the SCENARIO, `crop` is in viewport coordinates — because that is what the author sees
 * on screen. The render has a different resolution, so it must be converted here, and with TWO
 * scale factors, not one: if the viewport's aspect differs from the render's (e.g. 16:10 vs
 * 16:9), the image stretches by a DIFFERENT ratio on each axis. With a single factor the height
 * overruns the frame and ffmpeg fails — which is the better outcome: a silent misalignment
 * would go unnoticed.
 *
 * Cropping is not cosmetic: on a dense UI a GIF costs ~70–85 kB per frame, so the empty strip
 * you cut off directly determines the attachment size (measured: 2.3 MB → 630 kB).
 */
export function renderGif({ mp4Path, gifPath, workDir, viewport, crop, gif }) {
  const size = videoSize(mp4Path)
  const scaleX = size.width / viewport.width
  const scaleY = size.height / viewport.height

  let filter
  if (crop) {
    const x = even(crop.x * scaleX)
    const y = even(crop.y * scaleY)
    const w = Math.min(even(crop.w * scaleX), size.width - x)
    const h = Math.min(even(crop.h * scaleY), size.height - y)
    filter = `fps=${gif?.fps ?? 1.6},crop=${w}:${h}:${x}:${y},scale=${gif?.width ?? 900}:-1:flags=lanczos`
    console.log(`  crop: ${crop.w}×${crop.h} @${crop.x},${crop.y} (viewport) → ${w}×${h} @${x},${y} (render)`)
  } else {
    filter = `fps=${gif?.fps ?? 1.6},scale=${gif?.width ?? 900}:-1:flags=lanczos`
  }

  const frames = path.join(workDir, "frames")
  fs.mkdirSync(frames, { recursive: true })
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4Path, "-vf", filter, path.join(frames, "f-%03d.png")])

  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-framerate", String(gif?.frameDuration ? 1 / gif.frameDuration : 1.1),
    "-i", path.join(frames, "f-%03d.png"),
    "-vf", "split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
    "-loop", "0", gifPath,
  ])
}
