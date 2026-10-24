const fs = require('node:fs');
const css = fs.readFileSync('frontend/app/(marketing)/campspilot/marketing.css', 'utf8');
const colors = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map(match => [match[1], match[2]]));
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
const results = [['ink', 'paper'], ['ink', 'paper-2'], ['ink-2', 'paper-2'], ['ink-2', 'paper'], ['paper', 'ink'], ['accent-ink', 'paper'], ['fog-2', 'night']].map(([text, background]) => {
  const a = luminance(colors[text]), b = luminance(colors[background]);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return { text, background, ratio: Number(ratio.toFixed(2)), pass: ratio >= 4.5 };
});
fs.writeFileSync('.qa-cx31/contrast.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
if (results.some(result => !result.pass)) process.exitCode = 1;
