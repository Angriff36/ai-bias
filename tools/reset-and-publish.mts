import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const baseUrl = process.argv[2] ?? 'https://ai-tests.com'
const reportPath = process.argv[3] ?? resolve('data/expanded-race-and-identity-framing-audit-report.json')

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true, cwd: resolve('.') })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log('Resetting production public data...')
run('npx', [
  'wrangler', 'd1', 'execute', 'ai-bias-public', '--remote', '--command',
  'DELETE FROM report_pair_scores; DELETE FROM generated_reports; DELETE FROM analysis_snapshots; DELETE FROM public_runs; DELETE FROM model_aggregates;',
])

console.log(`Republishing ${reportPath} to ${baseUrl}...`)
run('npx', ['tsx', 'tools/publish-report-evidence.mts', reportPath, baseUrl])

console.log('Done.')
