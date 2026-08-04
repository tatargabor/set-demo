#!/usr/bin/env node
// set-demo CLI
//
//   set-demo <forgatókönyv.yaml> [--config <út>]
//
// A config alapértelmezetten a `set-demo.config.mjs` a futtatási könyvtárban.

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { runDemo } from "./index.mjs"

const args = process.argv.slice(2)
const scenarioArg = args.find((a) => !a.startsWith("--"))
const configIdx = args.indexOf("--config")
const configArg = configIdx >= 0 ? args[configIdx + 1] : null

if (!scenarioArg) {
  console.error("Használat: set-demo <forgatókönyv.yaml> [--config <út>]")
  process.exit(1)
}

const configPath = path.resolve(configArg || "set-demo.config.mjs")
if (!fs.existsSync(configPath)) {
  console.error(
    `Nincs konfiguráció: ${configPath}\n` +
      `A set-demo nem tud belépni a célrendszerbe konfiguráció nélkül — minta:\n` +
      `  node_modules/set-demo/set-demo.config.example.mjs`
  )
  process.exit(1)
}

const mod = await import(pathToFileURL(configPath).href)
const config = mod.default ?? mod

for (const kulcs of ["baseUrl", "outDir"]) {
  if (!config[kulcs]) {
    console.error(`Hiányzó konfigurációs kulcs: ${kulcs} (${configPath})`)
    process.exit(1)
  }
}

const { ok } = await runDemo({ config, scenarioPath: path.resolve(scenarioArg) })
process.exit(ok ? 0 : 1)
