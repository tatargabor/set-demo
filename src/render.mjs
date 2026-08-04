// Renderelés: Playwright-trace → MP4 (kurzor, koppintás, tempó) → vágott GIF.
//
// A kurzort, a kattintás-hullámot és a tempó-vezérlést a `playwright-recast` adja a
// trace-ből. NE írj rá saját overlay-t: a mért kísérlet szerint a saját változat ugyanezt
// csak rosszabbul tudta.

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { Recast } from "playwright-recast"

const paros = (n) => Math.max(2, Math.round(n / 2) * 2)

/**
 * @param {object} o
 * @param {string} o.tracesDir  a `test-results` könyvtár (trace.zip + .webm)
 * @param {string} o.mp4Path    a kimeneti MP4
 * @param {{width:number,height:number}} o.nezet  a felvételi viewport
 * @param {boolean} o.mobil
 * @param {{uresjarat?:number, cselekves?:number}} [o.tempo]
 * @param {number} [o.maxOldal=1920]  a renderelt kép hosszabbik oldalának maximuma
 */
export async function renderVideo({ tracesDir, mp4Path, nezet, mobil, tempo, maxOldal }) {
  let pipeline = Recast.from(tracesDir)
    .parse()
    .speedUp({ duringIdle: tempo?.uresjarat ?? 2.5, duringUserAction: tempo?.cselekves ?? 1.0 })

  // ⚠ Mobilon NINCS egérmutató — a kurzor-nyíl ott hazugság lenne: olyat mutatna a
  // telefonos képernyőn, ami a valóságban nincs. A koppintás-hullám viszont pont a helyes
  // jelzés: azt mutatja, hol ért a képernyőhöz az ujj.
  if (!mobil) pipeline = pipeline.cursorOverlay()
  pipeline = pipeline.clickEffect()

  // ⚠ A `resolution` KÖTELEZŐ, ha nem 16:9 a viewport: a recast alapból 1920×1080-ba
  // renderel, és a portré (mobil) felvételt vízszintesen SZÉTNYÚJTJA — mérve: a szöveg
  // olvashatatlanul széthúzva jött ki.
  //
  // ⚠⚠ A nagyítás NEM fix szorzó. Fix 3×-szal az asztali 1280×800-ból 3840×2400 lesz —
  // négyszer annyi pixel, mint a korábbi 1920×1080, és mérve HÁROMSZOROS fájlméret (2 MB →
  // 6 MB) nulla haszonért. Ehelyett a viewport ARÁNYÁT tartjuk, és a hosszabbik oldalt
  // maximáljuk: asztalon ~1,5×, portré mobilon ~2,3× nagyítás jön ki magától.
  const hosszabb = Math.max(nezet.width, nezet.height)
  const skala = Math.max(1, (maxOldal ?? 1920) / hosszabb)
  await pipeline
    .render({
      format: "mp4",
      resolution: { width: paros(nezet.width * skala), height: paros(nezet.height * skala) },
    })
    .toFile(mp4Path)
}

/** A renderelt videó tényleges felbontása — ebből jön a vágás átszámítása. */
export function videoMeret(mp4Path) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "json", mp4Path,
  ]).toString()
  return JSON.parse(out).streams[0]
}

/**
 * MP4 → GIF, opcionális vágással.
 *
 * ⚠ A `vago` a FORGATÓKÖNYVBEN a viewport koordinátáiban van — mert a szerző azt látja a
 * képernyőn. A render más felbontású, ezért itt át kell számolni, és KÉT skálafaktorral,
 * nem eggyel: ha a viewport aránya nem egyezik a renderével (pl. 16:10 vs 16:9), a kép a
 * két tengelyen KÜLÖNBÖZŐ arányban nyúlik. Egyetlen faktorral a magasság túlfut a képen,
 * és az ffmpeg elhasal — ami még a jobbik eset: a néma elcsúszás észrevétlen maradna.
 *
 * A vágás nem kozmetika: sűrű felületen a GIF ~70–85 kB/kocka, tehát a levágott üres sáv
 * közvetlenül a csatolmány méretét szabja meg (mérve: 2,3 MB → 630 kB).
 */
export function renderGif({ mp4Path, gifPath, munkaDir, nezet, vago, gif }) {
  const meret = videoMeret(mp4Path)
  const skalaX = meret.width / nezet.width
  const skalaY = meret.height / nezet.height

  let szures
  if (vago) {
    const x = paros(vago.x * skalaX)
    const y = paros(vago.y * skalaY)
    const w = Math.min(paros(vago.w * skalaX), meret.width - x)
    const h = Math.min(paros(vago.h * skalaY), meret.height - y)
    szures = `fps=${gif?.fps ?? 1.6},crop=${w}:${h}:${x}:${y},scale=${gif?.szelesseg ?? 900}:-1:flags=lanczos`
    console.log(`  vágás: ${vago.w}×${vago.h} @${vago.x},${vago.y} (viewport) → ${w}×${h} @${x},${y} (render)`)
  } else {
    szures = `fps=${gif?.fps ?? 1.6},scale=${gif?.szelesseg ?? 900}:-1:flags=lanczos`
  }

  const kockak = path.join(munkaDir, "kockak")
  fs.mkdirSync(kockak, { recursive: true })
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4Path, "-vf", szures, path.join(kockak, "k-%03d.png")])

  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-framerate", String(gif?.kockahossz ? 1 / gif.kockahossz : 1.1),
    "-i", path.join(kockak, "k-%03d.png"),
    "-vf", "split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
    "-loop", "0", gifPath,
  ])
}
