import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.map', '.txt', '.xml'])
const forbidden = [
  { label: 'OpenRouter-style secret', pattern: /sk-or-v1-[A-Za-z0-9_-]{20,}/ },
  { label: 'OpenAI-style secret', pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { label: 'Anthropic-style secret', pattern: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { label: 'Google-style secret', pattern: /AIza[A-Za-z0-9_-]{30,}/ },
  { label: 'Windows user path', pattern: /[A-Za-z]:[\\/]Users[\\/]/i },
  { label: 'removed application RPC', pattern: /\/api\/rpc\// },
  { label: 'removed Durable Object binding', pattern: /AiBiasDatabase|APP_STATE/ },
]

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  }))
  return nested.flat()
}

const failures = []
for (const file of await filesBelow(root)) {
  if (!textExtensions.has(extname(file).toLowerCase())) continue
  const contents = await readFile(file, 'utf8')
  for (const check of forbidden) {
    if (check.pattern.test(contents)) failures.push(`${check.label}: ${relative(root, file)}`)
  }
}

if (failures.length > 0) {
  console.error(`Public build verification failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`)
  process.exitCode = 1
} else {
  console.log('Public build verification passed: no credential, local-user-path, RPC, or Durable Object markers found.')
}
