import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const d=JSON.parse(read('content/articles.json'));
for (const i of d.items) {
 if(i.owner_reviewed!==true) throw Error('Content requires owner_reviewed: true');
 if(!i.sources?.length || i.sources.some(s=>{try{return new URL(s.url).protocol!=='https:'}catch{return true}})) throw Error('Valid HTTPS source required');
}
for(const issue of d.issues){if(issue.snapshots?.some(i=>i.owner_reviewed!==true))throw Error('Unreviewed archive snapshot');}
const json=JSON.stringify(d).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const html=read('template.html').replace('/*__CSS__*/',()=>read('styles.css')).replace('/*__DATA__*/',()=>json).replace('/*__JS__*/',()=>read('app.js'));
fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.html',html);fs.writeFileSync('dist/.nojekyll','');console.log(`Built ${d.items.length} reviewed entries`);
