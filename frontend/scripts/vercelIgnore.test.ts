import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

// Vercel Ignored Build Step: exit 0 skips the build, anything else builds.
const script = resolve(__dirname, 'vercel-ignore.sh')

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'vercel-ignore-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('init', '-q')
  git('config', 'user.email', 't@example.test')
  git('config', 'user.name', 'Test')
  mkdirSync(join(root, 'frontend'))
  mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'frontend', 'a.ts'), '1')
  git('add', '.')
  git('commit', '-qm', 'base')
  const base = git('rev-parse', 'HEAD')
  return { root, git, base }
}

function run(cwd: string, env: Record<string, string>) {
  return spawnSync('sh', [script], { cwd, env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv }).status
}

it('baut ohne Vorgänger-SHA (erste Deployment eines Branches)', () => {
  const { root } = repo()
  expect(run(join(root, 'frontend'), { VERCEL_PROJECT_PRODUCTION_URL: 'campspilot.vercel.app', VERCEL_GIT_COMMIT_REF: 'demo/jan' })).toBe(1)
})

it('überspringt CampsPilot, wenn sich nur Doku geändert hat', () => {
  const { root, git, base } = repo()
  writeFileSync(join(root, 'docs', 'x.md'), 'doc')
  git('add', '.')
  git('commit', '-qm', 'docs')
  expect(run(join(root, 'frontend'), { VERCEL_PROJECT_PRODUCTION_URL: 'campspilot.vercel.app', VERCEL_GIT_PREVIOUS_SHA: base })).toBe(0)
})

it('baut CampsPilot bei Frontend-Änderung', () => {
  const { root, git, base } = repo()
  writeFileSync(join(root, 'frontend', 'a.ts'), '2')
  git('add', '.')
  git('commit', '-qm', 'fe')
  expect(run(join(root, 'frontend'), { VERCEL_PROJECT_PRODUCTION_URL: 'campspilot.vercel.app', VERCEL_GIT_PREVIOUS_SHA: base })).toBe(1)
})

it('baut bei unbekanntem Vorgänger-SHA (flacher Clone)', () => {
  const { root } = repo()
  expect(run(join(root, 'frontend'), { VERCEL_GIT_PREVIOUS_SHA: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' })).toBe(1)
})

it('Legacy-Projekte bauen nur main', () => {
  const { root } = repo()
  const cwd = join(root, 'frontend')
  expect(run(cwd, { VERCEL_PROJECT_PRODUCTION_URL: 'ksv-sommercamps.vercel.app', VERCEL_GIT_COMMIT_REF: 'demo/jan' })).toBe(0)
  expect(run(cwd, { VERCEL_PROJECT_PRODUCTION_URL: 'ksv-sommercamps.vercel.app', VERCEL_GIT_COMMIT_REF: 'main' })).toBe(1)
})
