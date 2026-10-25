const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const cwd = path.resolve(__dirname, '..')
const file = path.join(cwd, 'frontend/app/components/saas/screens/CampConfigScreen.tsx')
const original = fs.readFileSync(file)
const source = original.toString('utf8')
const link = /            <ButtonLink href=\{`\/pilot\/\$\{orgSlug\}\/einrichtung\?schritt=4`\} variant="secondary">\r?\n\s*\{de\.einrichtung\.continueSetup\}\r?\n\s*<\/ButtonLink>/g
if ([...source.matchAll(link)].length !== 1) throw new Error('Expected exactly one added next-step link')
const command = 'npm run test --prefix frontend -- app/components/saas/selfstart.test.tsx -t Erstes.Camp.angelegt'
function run(log) {
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], { cwd, encoding: 'utf8', windowsHide: true })
  fs.writeFileSync(path.join(__dirname, log), `${command}\n${result.stdout || ''}${result.stderr || ''}\nEXIT_CODE=${result.status}\n`)
  if (result.error) throw result.error
  return result.status
}
let red
try {
  fs.writeFileSync(file, source.replace(link, ''))
  red = run('mutation-red.log')
} finally {
  fs.writeFileSync(file, original)
  const hash = value => crypto.createHash('sha256').update(value).digest('hex')
  const restored = fs.readFileSync(file)
  fs.writeFileSync(path.join(__dirname, 'mutation-restored.log'), `BEFORE_SHA256=${hash(original)}\nAFTER_SHA256=${hash(restored)}\nRESTORED=${original.equals(restored)}\n`)
}
if (red !== 1) throw new Error(`Mutation must fail with exit 1, received ${red}`)
const green = run('mutation-green.log')
if (green !== 0) throw new Error(`Restored test must pass, received ${green}`)
console.log('Mutation red: exit 1; restored test green: exit 0; original bytes restored.')
