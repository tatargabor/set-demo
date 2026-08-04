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
