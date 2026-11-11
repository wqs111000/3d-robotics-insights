import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderMarkdown, buildReports } from './reports.mjs';
let checks=0;
const test=(label,fn)=>{fn();checks++;console.log(`PASS ${label}`)};
const index=JSON.parse(fs.readFileSync('content/reports/index.json','utf8'));
const figures=JSON.parse(fs.readFileSync('content/reports/figures.json','utf8')).reports;
const expected={'mobile-manipulation':[13,32],'vision-language-navigation':[14,24]};
for(const r of index.reports){
 const md=fs.readFileSync(`content/reports/${r.content_file}`,'utf8'), parsed=renderMarkdown(md);
 if(expected[r.slug]){
  test(`${r.slug}: chapter count`,()=>assert.equal(parsed.headings.length,expected[r.slug][0]));
  test(`${r.slug}: reference count`,()=>assert.equal(parsed.referenceCount,expected[r.slug][1]));
 }
 test(`${r.slug}: no private chat identifiers`,()=>assert.doesNotMatch(md,/chatgpt\.com\/share|file_[0-9a-f]+|你(?:的|现有)|以现有MID|chant/i));
 test(`${r.slug}: evidence flags`,()=>{assert.equal(r.owner_reviewed,false);assert.equal(r.independently_tested,false)});
 test(`${r.slug}: declared figures`,()=>assert.equal((figures[r.slug]||[]).length,r.figure_count||0));
 test(`${r.slug}: figure sections`,()=>{for(const f of figures[r.slug]||[])assert.ok(parsed.headings.some(h=>h.id===f.section))});
}
const parsed=renderMarkdown(fs.readFileSync('content/reports/mobile-manipulation.md','utf8'));
test('citation anchors',()=>assert.match(parsed.html,/href="#ref-21"/));
test('reference targets',()=>assert.match(parsed.html,/id="ref-32"/));
test('tables accessible',()=>assert.match(parsed.html,/role="region" tabindex="0"/));
test('raw HTML escaped',()=>assert.match(renderMarkdown('<img src=x onerror=alert(1)>').html,/&lt;img/));
test('unsafe URL rejected',()=>assert.throws(()=>renderMarkdown('[bad](javascript:alert)')));
test('missing citation rejected',()=>assert.throws(()=>renderMarkdown('example [999]')));
test('duplicate heading rejected',()=>assert.throws(()=>renderMarkdown('## A {#same}\n\n## B {#same}')));
test('unfinished code rejected',()=>assert.throws(()=>renderMarkdown('```\ncode')));
test('table column mismatch rejected',()=>assert.throws(()=>renderMarkdown('| a | b |\n| --- | --- |\n| c |')));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'insights-report-'));
try {
 fs.mkdirSync(path.join(dir,'content'),{recursive:true});
 fs.cpSync('content/reports',path.join(dir,'content/reports'),{recursive:true});
 fs.mkdirSync(path.join(dir,'dist'),{recursive:true});
 const originalData='<script type="application/json" id="radar-data">{"items":[{"id":"unchanged"}]}</script>';
 fs.writeFileSync(path.join(dir,'dist/index.html'),`<html><a class="header-link" href="#archive">往期</a><section class="wrap archive-section"></section>${originalData}</html>`);
 const fixture={site:{public_url:'https://wqs111000.github.io/3d-robotics-insights/'},items:[{id:'fast-livo2',name:'FAST-LIVO2',title:'原观察条目'}]};
 buildReports({rootDir:dir,siteData:fixture});
 const read=p=>fs.readFileSync(path.join(dir,'dist',p),'utf8');
 test('home data bytes preserved',()=>assert.ok(read('index.html').includes(originalData)));
 test('home navigation integrated',()=>assert.match(read('index.html'),/href="reports\/"/));
 for(const r of index.reports.filter(r=>r.publish_approved)){
  const page=read(`reports/${r.slug}/index.html`);
  test(`${r.slug}: static article`,()=>assert.ok(page.includes(r.title)));
  test(`${r.slug}: Markdown exported`,()=>assert.ok(read(`reports/${r.slug}/report.md`).startsWith('# '+r.title)));
  test(`${r.slug}: canonical`,()=>assert.ok(page.includes(`https://wqs111000.github.io/3d-robotics-insights/reports/${r.slug}/`)));
  test(`${r.slug}: no external scripts/fonts`,()=>assert.doesNotMatch(page,/<(?:script|link)[^>]+(?:src|href)="https:[^"]+\.(?:js|css)/));
 }
 test('related observations retained',()=>assert.match(read('reports/mobile-manipulation/index.html'),/\.\.\/\.\.\/#item\/fast-livo2/));
 buildReports({rootDir:dir,siteData:fixture});
 test('repeat build has one nav/feature',()=>{assert.equal((read('index.html').match(/data-reports-nav/g)||[]).length,1);assert.equal((read('index.html').match(/data-report-feature/g)||[]).length,1)});
 const meta=structuredClone(index);for(const r of meta.reports)r.publish_approved=false;
 fs.writeFileSync(path.join(dir,'content/reports/index.json'),JSON.stringify(meta));
 buildReports({rootDir:dir,siteData:fixture});
 test('withdrawn reports removed',()=>{for(const r of index.reports)assert.ok(!fs.existsSync(path.join(dir,`dist/reports/${r.slug}/index.html`)))});
 test('draft metadata not exposed',()=>assert.equal(JSON.parse(read('reports/index.json')).reports.length,0));
 test('withdrawn feature removed',()=>assert.doesNotMatch(read('index.html'),/data-report-feature/));
} finally { fs.rmSync(dir,{recursive:true,force:true}); }
console.log(`${checks} tests passed`);
