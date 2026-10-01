import { ContainerRegistrationKeys } from "@medusajs/utils"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import factory from "../../index"
import posTerminalProviderIndex from "../../providers/pos-terminal/index"
import { getPluginOptions, PLUGIN_NAME } from "../plugin-options"

// Fonte única do nome + leitura de options do configModule (ADR 0002 §5).
// Os 4 caminhos de getPluginOptions eram zero-cobertos. O import do glue do
// provider cobre o index declarativo do ModuleProvider.
const scopeWith = (configModule: unknown) => ({
  resolve: (key: string) =>
    key === ContainerRegistrationKeys.CONFIG_MODULE ? configModule : undefined,
})

describe("plugin-options", () => {
  // cwd = raiz do pacote (pnpm script); import.meta é proibido no CJS
  // do tsconfig (module node16) e o plugin:build compila os specs.
  const pkg = JSON.parse(
    readFileSync(resolve(process.cwd(), "package.json"), "utf8")
  ) as { name: string }

  it("PLUGIN_NAME é o nome do pacote (fonte única, sem drift)", () => {
    expect(PLUGIN_NAME).toBe(pkg.name)
  })

  it("getPluginOptions lê options do entry objeto", () => {
    const scope = scopeWith({
      plugins: [{ resolve: PLUGIN_NAME, options: { sandbox: true } }],
    })
    expect(getPluginOptions(scope as never)).toEqual({ sandbox: true })
  })

  it("getPluginOptions devolve {} para entry objeto sem options", () => {
    const scope = scopeWith({ plugins: [{ resolve: PLUGIN_NAME }] })
    expect(getPluginOptions(scope as never)).toEqual({})
  })

  it("getPluginOptions devolve {} para entry string", () => {
    const scope = scopeWith({ plugins: [PLUGIN_NAME] })
    expect(getPluginOptions(scope as never)).toEqual({})
  })

  it("getPluginOptions devolve {} sem entry e sem configModule", () => {
    expect(getPluginOptions(scopeWith({ plugins: [] }) as never)).toEqual({})
    expect(getPluginOptions(scopeWith(undefined) as never)).toEqual({})
  })

  it("factory devolve o entry { resolve, options } do plugin", () => {
    expect(factory({ sandbox: true })).toEqual({
      resolve: PLUGIN_NAME,
      options: { sandbox: true },
    })
    expect(factory()).toEqual({ resolve: PLUGIN_NAME, options: {} })
    expect(posTerminalProviderIndex).toBeDefined()
  })
})
