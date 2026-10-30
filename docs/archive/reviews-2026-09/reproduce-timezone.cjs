// CAMP-002: execute the actual current form helpers, no app mutation or network.
// Run from repo root: node docs/reviews/reproduce-timezone.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'frontend/node_modules/typescript'));
function loadHelper(file, name) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(s => ts.isFunctionDeclaration(s) && s.name.text === name);
  assert.ok(declaration, `Actual helper ${name} must exist`);
  return ts.transpileModule(declaration.getText(ast), {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
}
const form = 'frontend/app/components/saas/config/CampConfigForm.tsx';
const actions = 'frontend/app/components/saas/actions/configActions.ts';
const context = {Date};
vm.createContext(context);
vm.runInContext(loadHelper(form, 'toLocalInputValue') + loadHelper(actions, 'str') + loadHelper(actions, 'toIsoDateTime'), context);
const originalZone = process.env.TZ;
try {
  const saved = '2026-09-23T10:00:00.000Z';
  process.env.TZ = 'Europe/Berlin';
  const unchangedInput = context.toLocalInputValue(saved);
  process.env.TZ = 'UTC';
  const afterSave = context.toIsoDateTime({get: () => unchangedInput}, 'registration_start');
  console.log(JSON.stringify({finding: 'CAMP-002', saved, browserInput: unchangedInput, afterSave}));
  assert.equal(afterSave, saved, 'Unchanged registration timestamp must survive Berlin browser -> UTC server');
} finally {
  if (originalZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalZone;
}
