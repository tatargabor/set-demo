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
const ASZTALI_NEZET = { width: 1280, height: 800 }

/**
 * Dátum-helyettesítés a forgatókönyvben: `{{ma}}` és `{{ma+3}}` / `{{ma-1}}` → ISO nap.
 *
 * Miért kell: a demónak gyakran MAI dátumot kell beírnia (ütemezés, határidő), a YAML pedig
 * nem tud számolni. Beégetett dátummal a forgatókönyv másnap némán elromlik — a felvétel
 * elkészülne, csak épp üres képernyőt mutatna.
 */
export function feloldDatum(ertek, most = new Date()) {
  if (typeof ertek !== "string") return ertek
  return ertek.replace(/\{\{\s*ma\s*([+-]\s*\d+)?\s*\}\}/g, (_, eltolas) => {
    const d = new Date(most)
    if (eltolas) d.setDate(d.getDate() + Number(eltolas.replace(/\s+/g, "")))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  })
}

/**
 * EGY lépés végrehajtása. Ugyanaz a szótár szolgálja ki a FELVÉTELT és az ELŐKÉSZÍTÉST —
 * szándékosan egyetlen implementációban.
 *
 * ⚠ Két párhuzamos, kézzel karbantartott lépés-értelmező előbb-utóbb szétcsúszik, és a
 * szétcsúszás iránya a rossz: az előkészítés csendben mást csinálna, mint amit a
 * forgatókönyv írója a felvételi lépésekből megtanult. A `keret.felvetel` kapcsolja ki a
 * feliratot, a reflektort és a nézői szüneteket — a CSELEKVÉS azonos marad.
 */
async function vegrehajtLepes({ page, lepes, keret }) {
  const { felvetel, feliratoz, reflektor, reflektorOff, tett, tettOff, fk, config, cimke } = keret

  if (lepes.megnyit) {
    await page.goto(`${config.baseUrl}${lepes.megnyit}`, { waitUntil: "networkidle", timeout: 45000 })
  }
  // A felirat az akció ELŐTT és UTÁN is kimegy: a kattintás navigációt válthat ki, ami
  // az injektált sávot a DOM-mal együtt elviszi.
  if (felvetel) await feliratoz(cimke, lepes.magyarazat)

  // ⚠ A SORREND: buborék a kattintás ELŐTT (hova megyünk), fókusz a kattintás UTÁN (mit
  // nézzen az eredményen). Fordítva a fókusz olyan elemre várna, amit épp a kattintás
  // hoz létre.
  const buborekCel = felvetel && lepes.buborek ? lepes.kattint || lepes.gorget?.hol : null
  if (buborekCel && (await reflektor(buborekCel, lepes.buborek))) {
    await page.waitForTimeout(lepes.buborekIdo ?? 1900)
  }

  if (lepes.kattint) {
    const cel = page.locator(lepes.kattint).first()
    // A hullámot a recast rajzolja a trace-ből (pontos időzítéssel) — mi a CÍMKÉT tesszük
    // mellé, gyűrű nélkül: két egymásra rajzolt kör zavaros lenne.
    await tett(cel, "kattint", lepes.kattintCimke, false)
    await cel.click()
    await tettOff()
  }

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

    // ⚠ A KIVÁLASZTÁS és a KATTINTÁS gyakran két KÜLÖNBÖZŐ elem: a kritérium a kártyán/soron
    // értelmes („ne olyan fuvart mutass, aminek 0 főterméke van"), a cselekvés viszont egy
    // gombon belül. A `benne:` nélkül a kritériumot a gombra kellene tenni — ahol a
    // megkülönböztető szöveg nincs is ott —, tehát a demó vagy rossz példányt mutat, vagy
    // a szerző beéget egy konkrét azonosítót.
    const cel = lepes.valaszt.benne ? valasztott.locator(lepes.valaszt.benne).first() : valasztott
    if (lepes.valaszt.benne && (await cel.count()) === 0) {
      throw new Error(
        `A választott elemben nincs "${lepes.valaszt.benne}" — a kritérium jó sort talált, ` +
          `de a cselekvés célja hiányzik belőle`
      )
    }
    await tett(cel, "kattint", lepes.kattintCimke ?? ((await cel.innerText().catch(() => "")) || "").trim().split("\n")[0], false)
    await cel.click()
    await tettOff()
  }

  if (buborekCel && !lepes.fokusz) await reflektorOff()

  if (felvetel && lepes.fokusz) {
    if (lepes.kattint) await page.waitForTimeout(lepes.fokusz.utana ?? 900)
    if (await reflektor(lepes.fokusz.hol, lepes.fokusz.szoveg)) {
      await page.waitForTimeout(lepes.fokusz.ido ?? 1800)
    }
  }

  if (lepes.kitolt) {
    // ⚠ A beírás a felvételen NYOMTALAN: a mező értéke egyszerre megjelenik, mintha magától
    // történt volna. A gyűrű + a beírt érték mutatja meg, hogy MI történik — a `clickEffect`
    // ide nem ér el, mert az csak valódi egérkattintást lát a trace-ben.
    const mezo = page.locator(lepes.kitolt.mezo).first()
    const ertek = feloldDatum(lepes.kitolt.ertek)
    await tett(mezo, "beír", lepes.kitolt.cimke ?? ertek)
    await page.fill(lepes.kitolt.mezo, ertek)
    if (felvetel) await page.waitForTimeout(lepes.kitolt.ido ?? 900)
    await tettOff()
  }

  if (lepes.billentyu) {
    // A billentyű a fókuszált elemen hat — a jelzés is oda kerül. Ha nincs fókusz (vagy nem
    // mérhető), a címke akkor is kimegy: a néma billentyű a legrosszabb, mert a képernyő
    // magától változik meg.
    await tett(page.locator(":focus").first(), "gomb", lepes.billentyu)
    await page.keyboard.press(lepes.billentyu)
    if (felvetel) await page.waitForTimeout(700)
    await tettOff()
  }

  if (lepes.gorget) {
    // Az egeret az elem fölé visszük, hogy a BELSŐ panel görögjön, ne az oldal.
    const cel = page.locator(lepes.gorget.hol).first()
    await cel.waitFor({ state: "visible", timeout: 10000 })
    await tett(cel, "görget", lepes.gorget.cimke ?? "", false)
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
    await tettOff()
  }

  if (felvetel) {
    await feliratoz(cimke, lepes.magyarazat)
    await page.waitForTimeout(lepes.varakozas ?? 2500)
    if (lepes.fokusz) await reflektorOff()
  } else if (lepes.varakozas) {
    // Előkészítésben csak akkor várunk, ha a lépés KIFEJEZETTEN kéri (mentés utáni
    // újratöltés) — a nézői tempó ott tiszta veszteség.
    await page.waitForTimeout(Math.min(lepes.varakozas, 3000))
  }

  // Az ELVÁRÁS teszi a demót bizonyítékká. Hiánya megengedett (pl. tiszta navigáció),
  // de akkor az a lépés nem bizonyít semmit — a riport ezt külön jelzi.
  if (lepes.elvaras) {
    await page.locator(lepes.elvaras).first().waitFor({ state: "visible", timeout: 10000 })
    return "ok"
  }
  return "nincs-elvaras"
}

/** Lépés-sorozat végrehajtása, lépésenkénti eredménnyel. Nem dob — az eredménybe ír. */
async function futtatLepeseket({ page, lepesek, keret, utana }) {
  const eredmenyek = []
  for (const [i, lepes] of (lepesek || []).entries()) {
    const cimke = lepes.cimke || `${i + 1}. lépés`
    let allapot
    try {
      allapot = await vegrehajtLepes({ page, lepes, keret: { ...keret, cimke } })
      eredmenyek.push({ cimke, allapot, magyarazat: lepes.magyarazat })
      console.log(`  ${allapot === "ok" ? "✓" : "·"} ${cimke}`)
    } catch (e) {
      allapot = "bukott"
      eredmenyek.push({ cimke, allapot, hiba: e.message.split("\n")[0].slice(0, 140) })
      console.log(`  ✗ ${cimke}\n      ${e.message.split("\n")[0].slice(0, 140)}`)
    }
    // ⚠ A lelet-gyűjtés a BUKOTT lépés után is fut — épp az a legértékesebb: ott derül ki,
    // hogy a hiányzó horgony nem létezik-e, vagy csak nem AKKOR látszik.
    if (utana) await utana(lepes, cimke, allapot)
  }
  return eredmenyek
}

/**
 * ELŐKÉSZÍTÉS — a demó ELŐÁLLÍTJA, amit mutatni fog.
 *
 * Miért külön fázis, és miért NEM kerül a felvételre:
 *
 * 1. **Van funkció, amihez elvileg nincs éles adat.** Mérve 2026-08-04: az éles rendszer 310
 *    rendeléséből NULLA ütemezett fuvar, nulla sofőrhöz rendelés, nulla leigazolás, és
 *    NULLA sofőr-jogú felhasználó — a kiszállítás-lánc egy nappal a kiadása után még
 *    elérhetetlen. Ilyenkor a „válasszunk egy jó példányt" stratégia elvileg sem működik.
 * 2. **Az előállítás gyakran MÁS nézetben történik, mint a bemutatás.** A fuvart az operátor
 *    ütemezi asztali képernyőn; a demó a sofőr TELEFONJÁT mutatja. Egy felvételbe a kettő
 *    nem fér: a viewport a felvétel tulajdonsága.
 * 3. **Az előkészítés nem a történet része.** A néző a funkciót akarja látni, nem azt, hogy
 *    a demó hogyan gründolta össze magának az adatot.
 *
 * ⚠ Az előkészítés bukása ABORTÁL. Enélkül a felvétel lefutna a hiányzó adaton, és egy ÜRES
 * képernyőről készülne szép videó — ez a néma kudarc osztálya: kívülről pontosan úgy néz ki,
 * mint a siker.
 */
async function elokeszit({ fk, config, chromium, browser }) {
  const nezet = fk.elokeszitesNezet || ASZTALI_NEZET
  const ctx = await browser.newContext({ viewport: nezet, locale: config.locale || "hu-HU" })
  if (config.prepare) await config.prepare(ctx, { mobil: false, nezet })
  const page = await ctx.newPage()
  if (config.login) await config.login(ctx, { baseUrl: config.baseUrl, page })

  console.log("  Előkészítés (nem kerül a felvételre):")
  const eredmenyek = await futtatLepeseket({
    page,
    lepesek: fk.elokeszites,
    // Az előkészítés nem kerül a felvételre, tehát a vizuális jelzések itt no-opok — de a
    // FÜGGVÉNYEKNEK létezniük kell, különben a közös lépés-értelmező elhasalna rajtuk.
    keret: { felvetel: false, tett: async () => {}, tettOff: async () => {}, fk, config },
  })
  await ctx.close()

  const bukott = eredmenyek.filter((e) => e.allapot === "bukott")
  if (bukott.length) {
    throw new Error(
      `Az előkészítés ${bukott.length} lépése elhasalt (${bukott.map((b) => b.cimke).join(", ")}) — ` +
        `a bemutatandó adat NEM áll elő, ezért a felvétel üres képernyőt rögzítene. Nem indítom el.`
    )
  }
  console.log("")
  return eredmenyek
}

export async function capture({ fk, config, chromium }) {
  // `nezet: mobil` — a telefonra készült képernyőket asztali viewporton felvenni
  // félrevezető: olyan elrendezést mutatna, amit a felhasználó soha nem lát.
  const mobil = fk.nezet === "mobil" || fk.mobil === true
  const nezet = mobil ? MOBIL_NEZET : fk.nezet || ASZTALI_NEZET

  const munkaDir = fs.mkdtempSync(path.join(os.tmpdir(), "set-demo-"))
  const tracesDir = path.join(munkaDir, "test-results", "demo")
  fs.mkdirSync(tracesDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })

  if (fk.elokeszites?.length) {
    try {
      await elokeszit({ fk, config, chromium, browser })
    } catch (e) {
      await browser.close()
      throw e
    }
  }

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

  /**
   * TETT-jelzés: gyűrű + címke arról, hogy MIT csinálunk — nem csak hol.
   *
   * A `gyuruvel: false` a kattintásra való: ott a hullámot a `clickEffect` rajzolja a
   * trace-ből, pontos időzítéssel, és két egymásra rajzolt kör csak zavarna.
   *
   * ⚠ Az `ikon` SZÓ, nem piktogram. A headless Chromium fontkészletéből hiányzik a legtöbb
   * szimbólum-glif: a `⌨` (U+2328) mérve `=`-ként renderelődött a felvételen — vagyis a
   * jelzés, aminek épp a MEGÉRTÉST kellene segítenie, értelmetlen jelet mutatott. Fallback
   * font nélkül ez a hiba csak a kész videón derül ki.
   *
   * ⚠ A meghiúsulás itt NEM hangos, és ez tudatos: a jelzés díszítés, nem bizonyíték. Ha
   * a cél épp nem mérhető (fókusz nélküli billentyű, eltűnő elem), a lépés menjen tovább —
   * a reflektornál ez fordítva van, mert ott a hiánya azt jelenti, hogy a néző NEM LÁT
   * semmit abból, amiről a felirat beszél.
   */
  const tett = async (cel, ikon, szoveg, gyuruvel = true) => {
    if (!szoveg && !ikon) return
    try {
      const b = await cel.boundingBox({ timeout: 2000 })
      if (!b) return
      const rovid = String(szoveg ?? "").slice(0, 48)
      await page.evaluate(
        ([bb, ik, sz, gy]) => window.__demoTett?.(bb, ik, sz, gy),
        [{ x: b.x, y: b.y, w: b.width, h: b.height }, esc(ikon), esc(rovid), gyuruvel]
      )
      await page.waitForTimeout(650)
    } catch {
      /* a jelzés elmaradhat — a lépés nem */
    }
  }
  const tettOff = async () => {
    await page.evaluate(() => window.__demoTett?.(null)).catch(() => {})
  }

  // A kiemelés UTÁN mindig jöjjön világos szakasz: ha a sötétítés folyamatos, a néző
  // hozzászokik, és a képernyő végig sötétnek látszik.
  const reflektorOff = async () => {
    await page.evaluate(() => window.__demoBuborek?.(null)).catch(() => {})
    await page.waitForTimeout(fk.tempo?.levego ?? 900)
  }

  /**
   * LELET-GYŰJTÉS — amit a felvétel MEGTUD, azt le is teszi.
   *
   * A demó az egyetlen eszköz a láncban, ami a valódi felületen, valódi adaton, INTERAKCIÓ
   * KÖZBEN jár. Az így szerzett tudás máshol nincs meg:
   *
   *   • a statikus felület-térkép (atlas) a saját fejlécében kimondja, hogy „regions that
   *     appear after interaction (detail panes, action bars, search results, menus) are not
   *     in this map" — a felvétel viszont ÉPP azokban jár;
   *   • egy elbukott lépés nem csak a demó baja: vagy a horgony nem létezik, vagy létezik,
   *     de nem AKKOR látszik — és ezt a statikus lista nem tudja megkülönböztetni.
   *
   * Ezért lépésenként rögzítjük, milyen `data-testid` volt JELEN a lapon abban a pillanatban.
   * A különbség két lépés között = az interakció után megjelenő felület, vagyis pontosan a
   * statikus térkép vakfoltja.
   */
  const leletek = []
  const lathatoHorgonyok = async () => {
    try {
      return await page.evaluate(() =>
        [...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid"))
      )
    } catch {
      return []
    }
  }

  const eredmenyek = await futtatLepeseket({
    page,
    lepesek: fk.lepesek,
    keret: { felvetel: true, feliratoz, reflektor, reflektorOff, tett, tettOff, fk, config },
    utana: async (lepes, cimke, allapot) => {
      leletek.push({ cimke, allapot, horgonyok: await lathatoHorgonyok() })
    },
  })

  await ctx.tracing.stop({ path: path.join(tracesDir, "trace.zip") })
  await ctx.close()
  await browser.close()

  return { eredmenyek, leletek, munkaDir, tracesDir: path.join(munkaDir, "test-results"), nezet, mobil }
}
