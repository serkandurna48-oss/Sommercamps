require('./render-preview.cjs');
const fs=require('fs');
const {computeBrandSafe,__internal}=require('../frontend/app/lib/brandPipeline.ts');
const contrast=(a,b)=>__internal.contrastRatio(__internal.hexToRgb(a),__internal.hexToRgb(b));
const lines=[];
for(const color of [null,'#C79B3B','#FFFFFF','#cc0000']) {
 const brand=computeBrandSafe(color,'#FFFFFF');
 lines.push('E-Mail tradition '+(color??'neutral')+': '+contrast(brand.on,brand.strong).toFixed(2)+':1');
}
lines.push('E-Mail akademie: '+contrast('#FFFFFF','#080b0a').toFixed(2)+':1');
lines.push('E-Mail kompakt: '+contrast('#FFFFFF','#0d0d0d').toFixed(2)+':1');
lines.push('Print text: '+contrast('#000000','#FFFFFF').toFixed(2)+':1');
fs.writeFileSync('.qa-cx32/contrast.log',lines.join('\n')+'\n');
console.log(lines.join('\n'));
