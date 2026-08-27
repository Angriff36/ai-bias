const baseUrl = process.argv[2] ?? 'https://ai-tests.com'

async function main() {
  const response = await fetch(`${baseUrl}/api/public/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: new URL(baseUrl).origin },
    body: JSON.stringify({ globalCohort: 'current' }),
  })
  const body = await response.json().catch(() => ({}))
  console.log(response.status, body)
  if (!response.ok && response.status !== 200) process.exit(1)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
