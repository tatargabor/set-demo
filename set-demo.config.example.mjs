// set-demo configuration — COPY this into your project root as `set-demo.config.mjs`.
//
// This file holds the PROJECT-SPECIFIC part. The engine (recording, spotlight, render, page)
// knows nothing about your application — the login, the target and the output come from here.

export default {
  // The target system. NEVER production: the demo performs real actions (clicks, creates,
  // saves) and real data is visible on the recording.
  baseUrl: process.env.DEMO_BASE_URL || "https://staging.example.com",

  // Where the output goes (one subdirectory per scenario).
  outDir: "docs/demos/dist",

  // The environment name shown in the page footer.
  environment: "staging",

  // Drives the browser context AND the language of the generated page (English and Hungarian
  // ship with the package; for anything else pass `pageStrings`).
  locale: "en-US",

  /**
   * Login. Run the demo with a DEDICATED user, never a colleague's: the recording is material
   * you send out, and the clicks are real actions in a real environment.
   *
   * The sample below is an Auth.js (NextAuth) credentials login. UI login depends on hydration
   * and is flaky, so we go straight to the endpoint.
   */
  async login(context, { baseUrl }) {
    const email = process.env.DEMO_LOGIN_EMAIL
    const password = process.env.DEMO_LOGIN_PASSWORD
    if (!email || !password) throw new Error("Missing DEMO_LOGIN_EMAIL / DEMO_LOGIN_PASSWORD")

    const req = context.request
    const csrf = await (await req.get(`${baseUrl}/api/auth/csrf`)).json()
    await req.post(`${baseUrl}/api/auth/callback/credentials`, {
      form: { csrfToken: csrf.csrfToken, email, password, redirect: "false" },
    })
    const session = await (await req.get(`${baseUrl}/api/auth/session`)).json()
    if (!session?.user) throw new Error(`Login failed (${email})`)
  },

  /**
   * Environment preparation before the recording (optional).
   *
   * ⚠ Whatever you hide here is HIDING, not fixing. If the recording shows noise that is not
   * about the feature being demonstrated (a flash, a shift), file it AS A BUG too — one of the
   * demo's benefits is precisely that it finds such things.
   */
  async prepare(context) {
    await context.addInitScript(() => {
      try {
        // Example: pre-seeding a client-side setting so hydration does not flash.
        if (!localStorage.getItem("app-layout-prefs")) {
          localStorage.setItem("app-layout-prefs", JSON.stringify({ state: {}, version: 0 }))
        }
      } catch {}
    })
  },
}
