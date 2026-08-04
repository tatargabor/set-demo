#!/usr/bin/env node
// set-demo CLI
//
//   set-demo <scenario.yaml> [--config <path>]
//
// The config defaults to `set-demo.config.mjs` in the working directory.

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { runDemo } from "./index.mjs"

const args = process.argv.slice(2)
const scenarioArg = args.find((a) => !a.startsWith("--"))
const configIdx = args.indexOf("--config")
const configArg = configIdx >= 0 ? args[configIdx + 1] : null

if (!scenarioArg) {
  console.error("Usage: set-demo <scenario.yaml> [--config <path>]")
  process.exit(1)
}

const configPath = path.resolve(configArg || "set-demo.config.mjs")
if (!fs.existsSync(configPath)) {
  console.error(
    `No configuration: ${configPath}\n` +
      `set-demo cannot log in to the target system without one — template:\n` +
      `  node_modules/set-demo/set-demo.config.example.mjs`
  )
  process.exit(1)
}

const mod = await import(pathToFileURL(configPath).href)
const config = mod.default ?? mod

for (const key of ["baseUrl", "outDir"]) {
  if (!config[key]) {
    console.error(`Missing configuration key: ${key} (${configPath})`)
    process.exit(1)
  }
}

const { ok } = await runDemo({ config, scenarioPath: path.resolve(scenarioArg) })
process.exit(ok ? 0 : 1)
