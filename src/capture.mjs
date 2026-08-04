// A felvétel: forgatókönyv-lépések végrehajtása valós felületen, trace-szel.
//
// ⚠ A forgatókönyv EGYBEN VÉGIGPRÓBA: minden lépéshez `elvaras` tartozhat, és ha egy nem
// teljesül, a futás HANGOSAN elhasal — nem készül szép videó törött funkcióról.
//
// ⚠ A projekt-specifikus rész NEM itt van: a belépés, a base URL, a kimeneti könyvtár és a
// környezet-előkészítés a hívó `config`-jából jön. Lásd `set-demo.config.example.mjs`.

import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { overlayScript, escapeHtml as esc } from "./overlay.mjs"

const MOBIL_NEZET = { width: 390, height: 844 }

export async function capture({ fk, config, chromium }) {
  // `nezet: mobil` — a telefonra készült képernyőket asztali viewporton felvenni
  // félrevezető: olyan elrendezést mutatna, amit a felhasználó soha nem lát.
  const mobil = fk.nezet === "mobil" || fk.mobil === true
  const nezet = mobil ? MOBIL_NEZET : fk.nezet || { width: 1280, height: 800 }

  const munkaDir = fs.mkdtempSync(path.join(os.tmpdir(), "set-demo-"))
  const tracesDir = path.join(munkaDir, "test-results", "demo")
  fs.mkdirSync(tracesDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: nezet,
    locale: config.locale || "hu-HU",
    // Érintés-emuláció: enélkül a felület az egeres ágon fut (hover-állapotok, más
    // breakpoint), és a felvétel nem azt mutatja, amit a felhasználó a telefonján lát.
    isMobile: mobil,
    hasTouch: mobil,
    deviceScaleFactor: mobil ? 3 : 1,
    recordVideo: { dir: tracesDir, size: nezet },
  })

  if (fk.felirat !== false) {
    await ctx.addInitScript(
      overlayScript({
        mobil,
        balOffset: fk.vago?.x ?? 0,
        jobbOffset: fk.vago ? Math.max(0, nezet.width - fk.vago.x - fk.vago.w) : 0,
      })
    )
  }

  // Projekt-specifikus környezet-előkészítés (initScript-ek, localStorage, feature flag).
  // Tipikus haszna: olyan vizuális zaj kivétele, ami nem a bemutatott funkcióról szól.
  // ⚠ Ha ilyet használsz, az ELREJTÉS, nem javítás — a mögötte lévő hibát vedd fel külön.
  if (config.prepare) await config.prepare(ctx, { mobil, nezet })

  await ctx.tracing.start({ screenshots: true, snapshots: true, sources: false })
  const page = await ctx.newPage()

  if (config.login) await config.login(ctx, { baseUrl: config.baseUrl, page })

  const feliratoz = async (cim, szoveg) => {
    if (fk.felirat === false) return
    await page.evaluate(([c, sz]) => window.__demoFelirat?.(c, sz), [esc(cim), esc(szoveg)]).catch(() => {})
  }

  // Reflektor: keret a területre + háttér-sötétítés + rövid szöveg.
  async function reflektor(sel, szoveg) {
    const cel = page.locator(sel).first()
    await cel.waitFor({ state: "visible", timeout: 10000 })
    // ⚠ Ha a kiemelendő terület a képen kívül van, ODAGÖRGETÜNK — enélkül a keret a
    // viewporton kívülre esik, és a felvételen NEM LÁTSZIK SEMMI. Alattomos, mert a
    // Playwright `hover()` magától görget: ugyanaz a selector a görgetés-ágon működik,
    // a kiemelés-ágon némán nem.
    await cel.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(350)
    const b = await cel.boundingBox()

    // ⚠ A néma kudarc a legrosszabb kimenet: a felvétel elkészül, kiemelés nélkül, és csak
    // a kész videón derül ki. Ezért minden meghiúsulás HANGOS.
    if (!b) {
      console.log(`      ⚠ nincs kiemelés: "${sel}" nem ad befoglaló keretet`)
      return false
    }
    if (b.width < 8 || b.height < 8) {
      console.log(`      ⚠ nincs kiemelés: "${sel}" mérete ${Math.round(b.width)}×${Math.round(b.height)} px`)
      return false
    }
    const v = { x: Math.max(0, b.x), y: Math.max(0, b.y) }
    const w = Math.min(b.x + b.width, nezet.width) - v.x
    const h = Math.min(b.y + b.height, nezet.height) - v.y
    if (w < 8 || h < 8) {
      console.log(`      ⚠ nincs kiemelés: "${sel}" a látható területen kívül van`)
      return false
    }
    if (h > nezet.height * 0.94 && w > nezet.width * 0.94) {
      console.log(`      ⚠ a kiemelés majdnem a teljes képernyő ("${sel}") — szűkebb selectort érdemes`)
    }
    await page.evaluate(([bb, sz]) => window.__demoBuborek?.(bb, sz), [{ x: v.x, y: v.y, w, h }, esc(szoveg)])
    console.log(`      kiemelve: ${Math.round(w)}×${Math.round(h)} px @${Math.round(v.x)},${Math.round(v.y)}`)
    return true
  }

  // A kiemelés UTÁN mindig jöjjön világos szakasz: ha a sötétítés folyamatos, a néző
  // hozzászokik, és a képernyő végig sötétnek látszik.
  const reflektorOff = async () => {
    await page.evaluate(() => window.__demoBuborek?.(null)).catch(() => {})
    await page.waitForTimeout(fk.tempo?.levego ?? 900)
  }

  const eredmenyek = []
  for (const [i, lepes] of (fk.lepesek || []).entries()) {
    const cimke = lepes.cimke || `${i + 1}. lépés`
    try {
      if (lepes.megnyit) {
        await page.goto(`${config.baseUrl}${lepes.megnyit}`, { waitUntil: "networkidle", timeout: 45000 })
      }
      // A felirat az akció ELŐTT és UTÁN is kimegy: a kattintás navigációt válthat ki, ami
      // az injektált sávot a DOM-mal együtt elviszi.
      await feliratoz(cimke, lepes.magyarazat)

      // ⚠ A SORREND: buborék a kattintás ELŐTT (hova megyünk), fókusz a kattintás UTÁN (mit
      // nézzen az eredményen). Fordítva a fókusz olyan elemre várna, amit épp a kattintás
      // hoz létre.
      const buborekCel = lepes.buborek ? lepes.kattint || lepes.gorget?.hol : null
      if (buborekCel && (await reflektor(buborekCel, lepes.buborek))) {
        await page.waitForTimeout(lepes.buborekIdo ?? 1900)
      }

      if (lepes.kattint) await page.locator(lepes.kattint).first().click()

      // Kritérium szerinti választás listából. Enélkül a demó „az első sort" mutatja, tehát
      // MINDEN FUTÁS MÁST — és a magyarázat elcsúszhat a képtől. A választott példányt
      // KIÍRJUK: egy néma választás miatt a következő futás eltérése megmagyarázhatatlan.
      if (lepes.valaszt) {
        let jeloltek = page.locator(lepes.valaszt.lista)
        for (const sz of lepes.valaszt.tartalmaz ?? []) jeloltek = jeloltek.filter({ hasText: sz })
        for (const sz of lepes.valaszt.kizar ?? []) jeloltek = jeloltek.filter({ hasNotText: sz })
        const db = await jeloltek.count()
        if (db === 0) {
          throw new Error(
            `Nincs a kritériumnak megfelelő elem: ${JSON.stringify(lepes.valaszt)} — ` +
              `a demó nem mutathat tetszőleges példányt helyette`
          )
        }
        const valasztott = jeloltek.first()
        const felirata = ((await valasztott.innerText()) || "").split("\n").slice(0, 2).join(" · ").slice(0, 90)
        console.log(`      választva (${db} jelöltből): ${felirata}`)
        await valasztott.click()
      }

      if (buborekCel && !lepes.fokusz) await reflektorOff()

      if (lepes.fokusz) {
        if (lepes.kattint) await page.waitForTimeout(lepes.fokusz.utana ?? 900)
        if (await reflektor(lepes.fokusz.hol, lepes.fokusz.szoveg)) {
          await page.waitForTimeout(lepes.fokusz.ido ?? 1800)
        }
      }

      if (lepes.kitolt) await page.fill(lepes.kitolt.mezo, lepes.kitolt.ertek)
      if (lepes.billentyu) await page.keyboard.press(lepes.billentyu)

      if (lepes.gorget) {
        // Az egeret az elem fölé visszük, hogy a BELSŐ panel görögjön, ne az oldal.
        const cel = page.locator(lepes.gorget.hol).first()
        await cel.waitFor({ state: "visible", timeout: 10000 })
        await cel.hover()
        // Apró lépés + szünet: a görgetés a nézőnek KÖVETHETŐ legyen, ne ugorjon.
        const teljes = lepes.gorget.mennyi ?? 400
        const koz = lepes.gorget.lepeskoz ?? 45
        const szunet = lepes.gorget.szunet ?? 170
        const lepesszam = Math.max(1, Math.round(Math.abs(teljes) / koz))
        for (let k = 0; k < lepesszam; k++) {
          await page.mouse.wheel(0, teljes / lepesszam)
          await page.waitForTimeout(szunet)
        }
      }

      await feliratoz(cimke, lepes.magyarazat)
      await page.waitForTimeout(lepes.varakozas ?? 2500)
      if (lepes.fokusz) await reflektorOff()

      // Az ELVÁRÁS teszi a demót bizonyítékká. Hiánya megengedett (pl. tiszta navigáció),
      // de akkor az a lépés nem bizonyít semmit — a riport ezt külön jelzi.
      let allapot = "nincs-elvaras"
      if (lepes.elvaras) {
        await page.locator(lepes.elvaras).first().waitFor({ state: "visible", timeout: 10000 })
        allapot = "ok"
      }
      eredmenyek.push({ cimke, allapot, magyarazat: lepes.magyarazat })
      console.log(`  ${allapot === "ok" ? "✓" : "·"} ${cimke}`)
    } catch (e) {
      eredmenyek.push({ cimke, allapot: "bukott", hiba: e.message.split("\n")[0].slice(0, 140) })
      console.log(`  ✗ ${cimke}\n      ${e.message.split("\n")[0].slice(0, 140)}`)
    }
  }

  await ctx.tracing.stop({ path: path.join(tracesDir, "trace.zip") })
  await ctx.close()
  await browser.close()

  return { eredmenyek, munkaDir, tracesDir: path.join(munkaDir, "test-results"), nezet, mobil }
}
