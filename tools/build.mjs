import fs from 'node:fs';
import { buildReports } from './reports.mjs';
const read=p=>fs.readFileSync(p,'utf8');
const d=JSON.parse(read('content/articles.json'));
for (const i of d.items) {
 if(i.publish_approved!==true) throw Error('Content requires publish_approved: true');
 if(!i.sources?.length || i.sources.some(s=>{try{return new URL(s.url).protocol!=='https:'}catch{return true}})) throw Error('Valid HTTPS source required');
}
for(const issue of d.issues){if(issue.snapshots?.some(i=>i.publish_approved!==true))throw Error('Archive snapshot requires publication approval');}
const json=JSON.stringify(d).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const html=read('template.html').replace('/*__CSS__*/',()=>read('styles.css')).replace('/*__DATA__*/',()=>json).replace('/*__JS__*/',()=>read('app.js'));
fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.html',html);fs.writeFileSync('dist/.nojekyll','');console.log(`Built ${d.items.length} publication-approved entries`);
buildReports({siteData:d});
fs.writeFileSync('dist/build-info.json',JSON.stringify({commit:process.env.GITHUB_SHA||null,built_at:new Date().toISOString()},null,2)+'\n');
