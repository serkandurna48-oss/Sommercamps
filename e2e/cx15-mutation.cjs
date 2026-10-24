const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const target = path.join(root, 'frontend/app/components/saas/data/StatusChip.tsx')
const original = fs.readFileSync(target, 'utf8')
const mutated = original.replaceAll('{label}', '{null /* CX15 mutation: status text removed */}')
if (original === mutated) throw new Error('Mutation target missing')
fs.mkdirSync(path.join(root, '.qa-cx15'), { recursive: true })
try {
  fs.writeFileSync(target, mutated)
  const cli = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
  const result = spawnSync(process.execPath, [cli, 'run', '--configLoader', 'native',
    'app/components/saas/data/MobileLists.test.tsx', '-t', 'status text'], {
    cwd: path.join(root, 'frontend'), encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' },
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  fs.writeFileSync(path.join(root, '.qa-cx15/mutation-red.log'), output)
  console.log(output)
  if (result.status !== 1 || !output.includes('AssertionError') || !/5 failed/.test(output)) {
    throw new Error(`Mutation did not produce the expected five assertion failures (exit ${result.status})`)
  }
  console.log('MUTATIONSPROBE: ROT – 5 Status-Text-Tests fehlgeschlagen; Original wird wiederhergestellt.')
} finally {
  fs.writeFileSync(target, original)
}
