const fs = require('fs');
const path = require('path');
const Module = require('module');
const { execFileSync } = require('child_process');
const fromFrontend = name => require.resolve(name, { paths: [path.resolve('frontend')] });
const ts = require(fromFrontend('typescript'));
const React = require(fromFrontend('react'));
const { renderToStaticMarkup } = require(fromFrontend('react-dom/server'));
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (m, filename) => m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const {computeBrandSafe}=require('../frontend/app/lib/brandPipeline.ts');
const brand=computeBrandSafe(null,'#FFFFFF');
const load = Module._load;
Module._load = function (name, parent, main) { if (name === './motion') return { useParentFlowMotion() {} }; return load.call(this, name, parent, main); };
const org = {slug:'testverein',name:'Testverein',theme:'tradition',contact_email:'verein@example.test',contact_phone:null,iban:null};
const camp = {slug:'sommer',title:'Sommercamp',start_date:'2027-07-05',end_date:'2027-07-09',price_cents:14900,currency:'EUR'};
const props = {org,camp,result:{status:'registered',payment_reference:'CP-TEST',registration_token:'synthetic'},childName:'Mia',parentEmail:'eva@example.test',onBackToOrg(){},onRegisterSibling(){}};
const filename=path.resolve('frontend/app/pilot/[org]/DoneScreen.tsx');
for (const state of ['before','after']) {
  const source=state==='before'?execFileSync('git',['show','HEAD:frontend/app/pilot/[org]/DoneScreen.tsx'],{encoding:'utf8'}):fs.readFileSync(filename,'utf8');
  const css=state==='before'?execFileSync('git',['show','HEAD:frontend/app/pilot/[org]/publicTheme.css'],{encoding:'utf8'}):fs.readFileSync('frontend/app/pilot/[org]/publicTheme.css','utf8');
  const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
  m._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
  const markup=renderToStaticMarkup(React.createElement(m.exports.default,props));
  fs.writeFileSync('.qa-cx32/'+state+'.html','<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}'+css+'</style><div class="cp-public" data-theme="tradition" style="--brand-strong:'+brand.strong+';--brand-on:'+brand.on+'"><div class="app">'+markup+'</div></div></html>');
}
console.log('Before/after static fixtures rendered from actual DoneScreen; synthetic data only.');
