// set-demo konfiguráció — MÁSOLD a projekted gyökerébe `set-demo.config.mjs` néven.
//
// Ez a fájl tartalmazza a PROJEKT-SPECIFIKUS részt. A motor (felvétel, reflektor, render,
// lap) semmit nem tud a te alkalmazásodról — a belépés, a cím és a kimenet innen jön.

export default {
  // A célrendszer. SOHA ne az éles legyen: a demó valós műveleteket hajt végre (kattint,
  // létrehoz, ment), és a felvételen valós adat látszik.
  baseUrl: process.env.DEMO_BASE_URL || "https://teszt.pelda.hu",

  // Hova kerül a kimenet (forgatókönyvenként egy alkönyvtár).
  outDir: "docs/demok/dist",

  // A lap láblécében megjelenő környezet-név.
  kornyezet: "teszt",

  locale: "hu-HU",

  /**
   * Belépés. A demó DEDIKÁLT felhasználóval fusson, soha nem egy kollégáéval: a felvétel
   * kiküldhető anyag, és a kattintások valós műveletek egy valós környezetben.
   *
   * Az alábbi minta Auth.js (NextAuth) credentials-belépés. A UI-login hidratáció-függő és
   * flaky, ezért megyünk közvetlenül a végpontra.
   */
  async login(context, { baseUrl }) {
    const email = process.env.DEMO_LOGIN_EMAIL
    const jelszo = process.env.DEMO_LOGIN_PASSWORD
    if (!email || !jelszo) throw new Error("Hiányzik a DEMO_LOGIN_EMAIL / DEMO_LOGIN_PASSWORD")

    const req = context.request
    const csrf = await (await req.get(`${baseUrl}/api/auth/csrf`)).json()
    await req.post(`${baseUrl}/api/auth/callback/credentials`, {
      form: { csrfToken: csrf.csrfToken, email, password: jelszo, redirect: "false" },
    })
    const session = await (await req.get(`${baseUrl}/api/auth/session`)).json()
    if (!session?.user) throw new Error(`Sikertelen belépés (${email})`)
  },

  /**
   * Környezet-előkészítés a felvétel előtt (opcionális).
   *
   * ⚠ Amit itt elrejtesz, az ELREJTÉS, nem javítás. Ha a felvételen olyan zaj látszik, ami
   * nem a bemutatott funkcióról szól (villanás, elcsúszás), azt vedd fel BEJELENTÉSKÉNT is
   * — a demó egyik haszna épp az, hogy megtalálja az ilyet.
   */
  async prepare(context) {
    await context.addInitScript(() => {
      try {
        // Példa: egy kliens-oldali beállítás előre rögzítése, hogy a hidratálás ne villanjon.
        if (!localStorage.getItem("app-layout-prefs")) {
          localStorage.setItem("app-layout-prefs", JSON.stringify({ state: {}, version: 0 }))
        }
      } catch {}
    })
  },
}
