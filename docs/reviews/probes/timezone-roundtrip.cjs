// Local-only CP-R004 probe: execute the actual TS formatter and server action,
// stubbing Next.js and API imports. No network, no database, no copied date logic.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'frontend/node_modules/typescript'));
function compile(source, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }}).outputText, {exports, Date, Number, String, Boolean, Set,
    require(name) { if (!(name in imports)) throw Error('Unexpected import: ' + name); return imports[name]; }});
  return exports;
}
let captured;
const action = compile(fs.readFileSync(path.join(root,
  'frontend/app/components/saas/actions/configActions.ts'), 'utf8'), {
  'next/navigation': {redirect() {throw Error('Unexpected redirect');}},
  'next/cache': {revalidatePath() {}},
  '../../../lib/adminSession': {getAdminToken: async () => 'synthetic-token'},
  '../../../lib/i18n/de': {CAMP_STATUSES: ['draft', 'published', 'closed', 'archived']},
  '../../../lib/saasAdminApi': {updateCampAdmin: async (org, camp, token, body) => {captured = body;}},
});
const formSource = fs.readFileSync(path.join(root,
  'frontend/app/components/saas/config/CampConfigForm.tsx'), 'utf8');
const start = formSource.indexOf('function toLocalInputValue(');
const end = formSource.indexOf('export default function', start);
if (start < 0 || end < 0) throw Error('Formatter moved; review probe must be updated');
const formatter = compile('export ' + formSource.slice(start, end), {});
(async () => {
  let failures = 0;
  for (const original of ['2026-09-23T08:00:00.000Z', '2026-12-23T08:00:00.000Z']) {
    process.env.TZ = 'Europe/Berlin';
    const browserValue = formatter.toLocalInputValue(original);
    const form = new FormData();
    for (const [key, value] of Object.entries({title:'Review camp', start_date:'2027-07-01',
      end_date:'2027-07-05', age_min:'6', age_max:'12', capacity:'10', price_euros:'1',
      status:'draft', registration_start:browserValue})) form.set(key, value);
    process.env.TZ = 'UTC';
    const result = await action.updateCampConfigAction('review', 'camp', {}, form);
    if (!result.saved) throw Error('Probe failed before the date roundtrip');
    const preserved = original === captured.registration_start;
    if (!preserved) failures++;
    console.log(JSON.stringify({id:'CP-R004', original, browserValue,
      serverSaved:captured.registration_start, acceptancePassed:preserved}));
  }
  // An ordinary nonzero exit marks the desired acceptance criterion as failing.
  process.exitCode = failures ? 1 : 0;
})();
