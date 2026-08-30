import { getPlatformProxy } from 'wrangler'

async function main() {
  const { env, dispose } = await getPlatformProxy({ configPath: 'wrangler.jsonc', remoteBindings: true })
  const key = process.env.OPENROUTER_API_KEY ?? (env as { OPENROUTER_API_KEY?: string }).OPENROUTER_API_KEY
  console.log('key available', Boolean(key?.trim()), 'len', key?.length ?? 0)
  await dispose()
}
main()
