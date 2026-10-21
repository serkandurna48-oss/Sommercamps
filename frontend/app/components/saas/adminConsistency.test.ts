import { globSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import ts from 'typescript'

const sources = [
  ...globSync('app/components/saas/**/*.{ts,tsx}'),
  ...globSync('app/pilot/**/*.{ts,tsx}').filter(file => file.replaceAll('\\', '/').includes('/(org-admin)/')),
  ...globSync('app/dev/admin-vorschau/**/*.{ts,tsx}'),
].filter(file => !file.includes('.test.'))

it('keeps every admin date formatter in lib/i18n/de.ts (source glob)', () => {
  expect(sources.length).toBeGreaterThan(70)
  const violations: string[] = []
  for (const file of sources) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    function visit(node: ts.Node) {
      if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && /(?:toLocaleDateString|toLocaleString|toLocaleTimeString|Intl\s*\.\s*DateTimeFormat)\b/.test(node.expression.getText(source))) {
        violations.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  expect(violations).toEqual([])
})

it('uses the shared Button for every admin action', () => {
  const violations = sources.filter(file => !file.replaceAll('\\', '/').endsWith('/ui/Button.tsx') && /<button\b/.test(readFileSync(file, 'utf8')))
  expect(violations).toEqual([])
})
