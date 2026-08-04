# set-demo

**Funkció-demó felvétel valós webalkalmazásról.** Egy forgatókönyv-YAML-ből GIF + MP4 +
önhordó HTML lapot készít — kurzorral, reflektorral, magyarázat-sávval —, és a felvétel
**egyben végigpróba**: minden lépéshez elvárás tartozhat, és ha egy nem teljesül, a futás
hangosan elhasal.

> **Miért:** a release notes szövege önmagában nem viszi át az új funkciót, a nagy
> kézikönyvben pedig senki nem találja meg, mi változott. Egy funkcióhoz egy lap, egy
> mozgókép — külön kiküldhetően.

## Telepítés

```bash
npm i -D set-demo
```

Rendszer-függőség: **`ffmpeg` és `ffprobe`** a PATH-on. A Playwright a hívó projekté
(peer dependency) — így ugyanaz a verzió és ugyanazok a böngésző-binárisok futnak, mint a
projekt tesztjeinél.

## Használat

1. Másold a `set-demo.config.example.mjs`-t a projekted gyökerébe `set-demo.config.mjs` néven,
   és töltsd ki a belépést + a base URL-t.
2. Írj forgatókönyvet (`docs/demok/pelda.yaml` — lásd `examples/`).
3. Futtasd:

```bash
npx set-demo docs/demok/pelda.yaml
```

Vagy programból:

```js
import { runDemo } from "set-demo"
import config from "./set-demo.config.mjs"

const { ok, lap } = await runDemo({ config, scenarioPath: "docs/demok/pelda.yaml" })
```

## Amit tud

| | |
|---|---|
| **kurzor + kattintás-hullám** | a Playwright trace-ből, a `playwright-recast`-tal |
| **reflektor** | tetszőleges terület kiemelése: keret + háttér-sötétítés + rövid szöveg |
| **magyarázat-sáv** | a lap aljára injektálva, ezért a tempó-vezérléssel együtt mozog |
| **tempó** | az üresjárat gyorsítása, a cselekvés normál tempóban; „levegő” a kiemelések közt |
| **mobil nézet** | `nezet: mobil` → 390×844, érintés-emuláció, portré felbontás, kurzor nélkül |
| **kritérium-választás** | listából a megfelelő példány, kiírva melyik — nem „az első sor” |
| **elvárás-kapu** | a demó csak akkor készül el, ha a bemutatott út végigjárható |

## Három csapda, amit a motor már kezel

1. **A `playwright-recast` `highlight()`/`markClick()` helperei némán hatástalanok** a
   Playwright test runneren kívül (`test.step` annotációt írnak, `_step` híján `return`).
   Ezért injektálja a set-demo a saját rétegét.
2. **A recast 1920×1080-ba renderel**, ha nem kap `resolution`-t — a portré felvételt
   vízszintesen szétnyújtja. A vágás átszámítása pedig **tengelyenként külön** skálafaktort
   igényel, ha a viewport aránya nem egyezik a renderével.
3. **A kiemelés némán elmaradhat**, ha a cél a viewporton kívül van: a Playwright `hover()`
   magától görget, a `boundingBox()` nem. A motor odagörget, és minden kiemelést kiír.

## Ismert adósság — kimondva

- **A forgatókönyv mezőnevei magyarok** (`cimke`, `magyarazat`, `kattint`, `fokusz`…), mert
  az eszköz egy magyar nyelvű projektből lett kiszervezve, és a meglévő forgatókönyveknek
  működniük kell. Az angol alias-réteg nyitott feladat.
- **Nincs teszt.** A motor ma egyetlen valós rendszeren van bizonyítva; önteszt kellene rá.
- **A GIF-méret nem optimalizált** — sűrű felületen ~70–85 kB/kocka. A vágás (`vago`) a
  leghatékonyabb kar.

## Licenc

MIT
