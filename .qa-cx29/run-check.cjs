const fs = require('node:fs')
const { spawn } = require('node:child_process')
const [log, cli, ...args] = process.argv.slice(2)
const file = fs.openSync(log, 'w')
function record(chunk, stream = process.stdout) {
  fs.writeSync(file, chunk)
  stream.write(chunk)
}
record(`START=${new Date().toISOString()}\nCOMMAND=${cli} ${args.join(' ')}\n`)
const child = spawn(process.execPath, [cli, ...args], {
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
})
child.stdout.on('data', chunk => record(chunk))
child.stderr.on('data', chunk => record(chunk, process.stderr))
child.on('error', error => record(`${error.stack}\n`, process.stderr))
child.on('close', code => {
  record(`\nEXIT_CODE=${code ?? 1}\n`)
  fs.closeSync(file)
  process.exitCode = code ?? 1
})
