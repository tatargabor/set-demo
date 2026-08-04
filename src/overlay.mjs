// A lapba injektált réteg: magyarázat-sáv + reflektor (keret + háttér-sötétítés + buborék).
//
// ⚠ MIÉRT A LAPBA, és nem utólag a videóra: így a felirat együtt mozog a képpel, tehát a
// tempó-vezérlés (`speedUp`) utáni időzítést nem kell újraszámolni — az ugyanis az a pont,
// ahol a feliratozás rendszerint elcsúszik, és a kész videón nézve senki nem veszi észre.
//
// ⚠ A `playwright-recast` `highlight()`/`markClick()` helperei ugyanezt tudnák, DE csak a
// Playwright test runnerben: `test.step` annotációt írnak, és `_step` híján NÉMÁN nem
// csinálnak semmit. Aki a runneren kívül hívja, zöld futást kap nulla hatással.

/**
 * @param {{ mobil: boolean, balOffset: number, jobbOffset: number }} opts
 *   A sávot a VÁGOTT régióhoz igazítjuk, nem a viewporthoz — enélkül a felirat eleje és
 *   vége a vágással együtt eltűnik (mérve: „ás az Ajánlatkérések fülre”). Ezt a hívó tudja
 *   kiszámolni, a forgatókönyvíró nem: ő a szöveget írja, nem a geometriát.
 */
export function overlayScript({ mobil = false, balOffset = 0, jobbOffset = 0 } = {}) {
  const m = (mobilErtek, asztaliErtek) => (mobil ? mobilErtek : asztaliErtek)
  return `
(() => {
  const beallit = () => {
    if (document.getElementById('__demo_felirat')) return
    const s = document.createElement('style')
    s.textContent = \`
      #__demo_felirat{position:fixed;left:${balOffset}px;right:${jobbOffset}px;bottom:0;z-index:2147483645;
        pointer-events:none;padding:${m(10, 14)}px ${m(14, 22)}px;
        font:500 ${m(13, 17)}px/1.4 system-ui,-apple-system,sans-serif;
        color:#fff;background:linear-gradient(to top,rgba(9,9,11,.94) 60%,rgba(9,9,11,0));
        opacity:0;transition:opacity .3s ease;text-shadow:0 1px 2px rgba(0,0,0,.6)}
      #__demo_felirat.lat{opacity:1}
      #__demo_felirat b{display:block;font-weight:700;font-size:${m(14, 18)}px;margin-bottom:2px}
    \`
    document.head.appendChild(s)
    const d = document.createElement('div')
    d.id = '__demo_felirat'
    document.body.appendChild(d)
  }
  if (document.body) beallit(); else document.addEventListener('DOMContentLoaded', beallit)

  window.__demoFelirat = (cim, szoveg) => {
    beallit()
    const d = document.getElementById('__demo_felirat')
    if (!d) return
    d.innerHTML = cim ? '<b>' + cim + '</b>' + (szoveg || '') : (szoveg || '')
    d.classList.toggle('lat', !!(cim || szoveg))
  }

  // Reflektor: keret a területre + a háttér elhalványítása + rövid szöveg mellette.
  // A sötétítés a bevett "spotlight" idióma: egy óriási box-shadow az elem KÖRÉ.
  window.__demoBuborek = (b, szoveg) => {
    beallitB()
    const k = document.getElementById('__demo_keret')
    const bu = document.getElementById('__demo_buborek')
    if (!k || !bu) return
    if (!b) { k.classList.remove('lat'); bu.classList.remove('lat'); return }
    k.style.transform = 'translate(' + (b.x - 4) + 'px,' + (b.y - 4) + 'px)'
    k.style.width = (b.w + 8) + 'px'
    k.style.height = (b.h + 8) + 'px'
    k.classList.add('lat')
    if (!szoveg) { bu.classList.remove('lat'); return }
    bu.textContent = szoveg
    bu.classList.add('lat')
    // Előbb megjelenítjük, hogy legyen mérhető mérete, utána pozicionálunk.
    const bb = bu.getBoundingClientRect()
    const alatta = b.y + b.h + 14
    const felette = b.y - bb.height - 14
    // Alá tesszük, ha ott elfér; különben fölé — így sosem lóg ki a képből.
    const y = alatta + bb.height < window.innerHeight - 90 ? alatta : Math.max(8, felette)
    const x = Math.min(Math.max(8, b.x + b.w / 2 - bb.width / 2), window.innerWidth - bb.width - 8)
    bu.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)'
  }

  // TETT-jelzés: mit csinálunk a felülettel, nem csak hol.
  //
  // ⚠⚠ EBBEN A BLOKKBAN NINCS BACKTICK — se kódban, se KOMMENTBEN. Az egész IIFE egy
  // template literal belseje, tehát egyetlen backtick lezárja a stringet, és a hiba a fájl
  // EGY MÁSIK pontján jelentkezik ("Unexpected identifier"). Kétszer futottam bele.
  //
  // A clickEffect hulláma a trace-ből jön, tehát CSAK a valódi egérkattintást mutatja.
  // A beírás, a billentyű és a görgetés a felvételen NYOMTALAN: a mező értéke egyszerre
  // megjelenik, mintha magától történt volna. A néző így a HELYET látja, a CSELEKVÉST nem.
  //
  // A gyűrű szándékosan MÁS színű (rózsa), mint a reflektor (petrol): a kettő két külön
  // dolgot mond — „ide nézz" vs. „ezt csinálom". Egy színnel a néző összemosná őket.
  window.__demoTett = (b, ikon, szoveg, gyuruvel) => {
    beallitT()
    const g = document.getElementById('__demo_gyuru')
    const c = document.getElementById('__demo_tett')
    if (!g || !c) return
    if (!b) { g.classList.remove('lat'); c.classList.remove('lat'); return }
    if (gyuruvel !== false) {
      const meret = Math.max(34, Math.min(b.w, b.h) + 16)
      g.style.width = meret + 'px'; g.style.height = meret + 'px'
      g.style.transform = 'translate(' + Math.round(b.x + b.w / 2 - meret / 2) + 'px,' +
        Math.round(b.y + b.h / 2 - meret / 2) + 'px)'
      g.classList.remove('lat'); void g.offsetWidth; g.classList.add('lat')
    } else {
      g.classList.remove('lat')
    }
    if (!szoveg && !ikon) { c.classList.remove('lat'); return }
    c.innerHTML = (ikon ? '<i>' + ikon + '</i>' : '') + (szoveg || '')
    c.classList.add('lat')
    const bb = c.getBoundingClientRect()
    // A címke a doboz FÖLÉ megy, ha ott elfér — a beírt érték maga a mezőben jelenik meg,
    // tehát alá téve eltakarná a saját eredményét.
    const felette = b.y - bb.height - 12
    const y = felette > 8 ? felette : Math.min(b.y + b.h + 12, window.innerHeight - bb.height - 90)
    const x = Math.min(Math.max(8, b.x + b.w / 2 - bb.width / 2), window.innerWidth - bb.width - 8)
    c.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)'
  }

  function beallitT() {
    if (document.getElementById('__demo_gyuru')) return
    const s = document.createElement('style')
    s.textContent = \`
      @keyframes __demo_pulzus{0%{transform:scale(.55);opacity:0}
        35%{opacity:1}100%{transform:scale(1.9);opacity:0}}
      #__demo_gyuru{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;
        border-radius:50%;border:3px solid #e11d48;box-shadow:0 0 0 3px rgba(225,29,72,.22);
        opacity:0}
      #__demo_gyuru.lat{opacity:1}
      #__demo_gyuru.lat::after{content:'';position:absolute;inset:-3px;border-radius:50%;
        border:3px solid #e11d48;animation:__demo_pulzus 1.1s ease-out infinite}
      #__demo_tett{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;
        max-width:${m(280, 420)}px;padding:${m(6, 8)}px ${m(10, 13)}px;border-radius:8px;
        background:#e11d48;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        font:600 ${m(12, 15)}px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;
        box-shadow:0 4px 14px rgba(0,0,0,.35);
        opacity:0;transition:opacity .2s ease,transform .3s cubic-bezier(.22,.61,.36,1)}
      #__demo_tett.lat{opacity:1}
      #__demo_tett i{font-style:normal;margin-right:6px;opacity:.9}
    \`
    document.head.appendChild(s)
    const g = document.createElement('div'); g.id = '__demo_gyuru'
    const c = document.createElement('div'); c.id = '__demo_tett'
    document.body.append(g, c)
  }

  function beallitB() {
    if (document.getElementById('__demo_keret')) return
    const s = document.createElement('style')
    s.textContent = \`
      #__demo_keret{position:fixed;left:0;top:0;z-index:2147483644;pointer-events:none;
        border:3px solid #0d9488;border-radius:9px;box-shadow:0 0 0 9999px rgba(9,9,11,.46);
        opacity:0;transition:opacity .28s ease,transform .35s cubic-bezier(.22,.61,.36,1)}
      #__demo_keret.lat{opacity:1}
      #__demo_buborek{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;
        max-width:${m(300, 420)}px;padding:${m(7, 9)}px ${m(11, 14)}px;border-radius:9px;
        background:#0d9488;color:#fff;
        font:600 ${m(12, 15)}px/1.35 system-ui,-apple-system,sans-serif;
        box-shadow:0 4px 14px rgba(0,0,0,.35);
        opacity:0;transition:opacity .28s ease,transform .35s cubic-bezier(.22,.61,.36,1)}
      #__demo_buborek.lat{opacity:1}
    \`
    document.head.appendChild(s)
    const k = document.createElement('div'); k.id = '__demo_keret'
    const bu = document.createElement('div'); bu.id = '__demo_buborek'
    document.body.append(k, bu)
  }
})()
`
}

export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])
