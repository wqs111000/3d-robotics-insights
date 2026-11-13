import fs from 'node:fs';
import path from 'node:path';

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeHref(value) {
 if (/^#[a-z0-9-]+$/.test(value)) return value;
 try { const u = new URL(value); if (u.protocol === 'https:') return u.href; } catch {}
 throw new Error(`Unsupported report link: ${value}`);
}
function inline(text) {
 const re = /`([^`]+)`|\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|\[(\d+)\]/g;
 let html = '', pos = 0;
 for (const m of text.matchAll(re)) {
  html += escapeHTML(text.slice(pos, m.index));
  if (m[1]) html += `<code>${escapeHTML(m[1])}</code>`;
  else if (m[2]) html += `<a href="${escapeHTML(safeHref(m[3]))}"${m[3].startsWith('#') ? '' : ' target="_blank" rel="noopener noreferrer"'}>${escapeHTML(m[2])}</a>`;
  else if (m[4]) html += `<strong>${escapeHTML(m[4])}</strong>`;
  else html += `<sup><a class="citation" href="#ref-${m[5]}" aria-label="参考资料 ${m[5]}">[${m[5]}]</a></sup>`;
  pos = m.index + m[0].length;
 }
 return html + escapeHTML(text.slice(pos));
}

// Deliberately small Markdown subset; raw HTML is escaped, not executed.
export function renderMarkdown(markdown) {
 const lines = markdown.replace(/\r/g, '').split('\n'), out = [], headings = [], used = new Set();
 const refs = new Set(), cites = [...markdown.matchAll(/\[(\d+)\](?!\()/g)].map(m => m[1]);
 let i = 0, referenceMode = false;
 const tableCells = s => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
 while (i < lines.length) {
  const s = lines[i].trim();
  if (!s) { i++; continue; }
  if (s.startsWith('```')) {
   const body = []; i++;
   while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++]);
   if (i === lines.length) throw new Error('Unclosed code fence');
   i++; out.push(`<pre><code>${escapeHTML(body.join('\n'))}</code></pre>`); continue;
  }
  const h = s.match(/^(#{2,3})\s+(.+?)(?:\s+\{#([a-z0-9-]+)\})?$/);
  if (h) {
   const id = h[3] || `section-${used.size + 1}`;
   if (used.has(id)) throw new Error(`Duplicate heading ${id}`);
   used.add(id); referenceMode = id === 'references';
   if (h[1].length === 2) headings.push({id, title:h[2]});
   out.push(`<h${h[1].length} id="${id}" tabindex="-1">${inline(h[2])}</h${h[1].length}>`); i++; continue;
  }
  if (s.startsWith('|') && i + 1 < lines.length && /^\|[\s:|\-]+\|$/.test(lines[i + 1].trim())) {
   const head = tableCells(s), rows = []; i += 2;
   while (i < lines.length && lines[i].trim().startsWith('|')) {
    const cells = tableCells(lines[i++]);
    if (cells.length !== head.length) throw new Error('Mismatched table columns');
    rows.push(`<tr>${cells.map(c=>`<td>${inline(c)}</td>`).join('')}</tr>`);
   }
   out.push(`<div class="table-scroll" role="region" tabindex="0" aria-label="技术对照表，可横向滚动"><table><thead><tr>${head.map(c=>`<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`); continue;
  }
  if (/^(\d+\.|-)\s/.test(s)) {
   const ordered = /^\d+\./.test(s), items = [];
   while (i < lines.length && (ordered ? /^\d+\.\s/ : /^-\s/).test(lines[i].trim())) {
    const line = lines[i++].trim(), n = line.match(/^\d+/)?.[0];
    if (referenceMode && n) { if (refs.has(n)) throw new Error(`Duplicate reference ${n}`); refs.add(n); }
    items.push(`<li${referenceMode && n ? ` id="ref-${n}"` : ''}>${inline(line.replace(/^(\d+\.|-)\s+/, ''))}</li>`);
   }
   const tag = ordered ? 'ol' : 'ul'; out.push(`<${tag}${referenceMode?' class="references"':''}>${items.join('')}</${tag}>`); continue;
  }
  if (s.startsWith('> ')) { out.push(`<blockquote>${inline(s.slice(2))}</blockquote>`); i++; continue; }
  const p = [s]; i++;
  while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|```|\||> |\d+\.\s|-\s)/.test(lines[i].trim())) p.push(lines[i++].trim());
  out.push(`<p>${inline(p.join(' '))}</p>`);
 }
 for (const n of cites) if (!refs.has(n)) throw new Error(`Missing reference ${n}`);
 return {html:out.join('\n'), headings, referenceCount:refs.size};
}

const css = `:root{--ink:#182c29;--green:#257f62;--muted:#687a70;--line:#dce4da;--paper:#f6f5f0}*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:90px}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.85 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}a{color:var(--green);text-underline-offset:3px}button,input{font:inherit}button{cursor:pointer}a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible,[tabindex="0"]:focus-visible{outline:2px solid var(--green);outline-offset:4px}.skip-link{position:absolute;top:-100px}.skip-link:focus{top:5px;left:10px;background:white;z-index:20}.site-header{position:sticky;top:0;z-index:10;background:var(--paper);border-bottom:1px solid var(--line)}.header-inner{max-width:1100px;margin:auto;min-height:68px;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink);line-height:1.2}.brand svg{width:32px;height:32px;color:var(--green);flex-shrink:0}.brand strong{display:block;font-size:16px;white-space:nowrap}.brand small{display:block;font-size:10px;color:var(--muted);margin-top:4px;letter-spacing:.08em}.site-nav{display:flex;gap:20px;white-space:nowrap}.site-nav a{font-size:13px;text-decoration:none;min-height:44px;display:flex;align-items:center}.site-nav [aria-current]{font-weight:700;border-bottom:2px solid var(--green)}.progress{height:2px;background:var(--line)}.progress span{display:block;background:var(--green);height:100%;width:0}.report-shell{max-width:1100px;margin:0 auto;padding:36px 24px 70px;display:grid;grid-template-columns:218px minmax(0,1fr);gap:48px}.toc-desktop{align-self:start;position:sticky;top:100px;max-height:calc(100dvh - 130px);overflow:auto}.toc-title{font-size:12px;letter-spacing:.1em;color:var(--muted);margin:0 0 15px}.toc-links a{display:block;font-size:12px;color:var(--muted);text-decoration:none;line-height:1.7;padding:7px 8px;border-left:2px solid var(--line);margin-bottom:2px}.toc-links a:hover,.toc-links a[aria-current]{color:var(--green);background:#edf2e9;border-color:var(--green)}.toc-mobile{display:none}.report-article{min-width:0}.eyebrow{font-size:11px;letter-spacing:.08em;color:var(--green);font-weight:650;margin:0 0 8px}h1{font-size:36px;line-height:1.35;letter-spacing:-.035em;margin:0 0 14px}.subtitle{font-size:17px;line-height:1.8;color:#4f6458;margin:0 0 16px}.metadata{font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:6px 16px}.tools{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 16px}.tools a,.tools button{font-size:12px;text-decoration:none;border:1px solid var(--line);border-radius:5px;background:transparent;color:var(--green);padding:8px 12px;min-height:40px}.article-body{font-size:16px;overflow-wrap:anywhere}.article-body p{margin:16px 0}.article-body h2{font-size:23px;line-height:1.55;margin:48px 0 18px;padding-bottom:10px;border-bottom:1px solid var(--line);letter-spacing:-.02em;scroll-margin-top:90px}.article-body h2:first-child{margin-top:28px}.article-body h3{font-size:18px;margin:28px 0 12px;line-height:1.6}.article-body strong{font-weight:650}.article-body ul,.article-body ol{padding-left:24px}.article-body li{margin:10px 0}.article-body code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.86em;background:#e9eee6;border-radius:3px;padding:2px 4px;overflow-wrap:anywhere}.article-body pre{background:#eaf0e8;border:1px solid var(--line);border-radius:6px;padding:17px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85;font-size:14px}.article-body pre code{padding:0;background:none;font-size:1em}.article-body blockquote{margin:22px 0;padding:12px 18px;border-left:3px solid var(--green);background:#edf2e9}.table-scroll{margin:24px 0;overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:#fff}table{border-collapse:collapse;width:100%;min-width:520px;font-size:14px;line-height:1.8}th,td{text-align:left;vertical-align:top;padding:12px 14px;border-bottom:1px solid var(--line)}th{background:#edf2e9;font-weight:650}tr:last-child td{border:0}th:first-child,td:first-child{min-width:130px}sup{font-size:11px;line-height:0}sup a{text-decoration:none;margin:0 1px}.references{font-size:13px;color:#4f6458;line-height:1.85}.references li{scroll-margin-top:95px;padding:5px 0}.references a{overflow-wrap:anywhere}.references li:target{background:#e1eddf;border-radius:4px}.report-footer{border-top:1px solid var(--line);margin-top:36px;padding-top:24px;font-size:13px;color:var(--muted)}.report-footer h2{font-size:16px;color:var(--ink)}.related{display:grid;gap:7px}.related a{font-size:13px}.back-top{display:block;text-align:right;margin:24px 0}.listing{max-width:920px;margin:32px auto 80px;padding:0 24px}.listing h1{font-size:30px}.listing .subtitle{font-size:15px;margin:0 0 24px}.list-search{display:flex;gap:14px;align-items:center;margin:0 0 24px}.list-search input{max-width:440px;min-width:0;flex:1;background:white;border:1px solid var(--line);border-radius:5px;padding:10px 12px;font-size:16px}.list-search span{font-size:12px;color:var(--muted);white-space:nowrap}.report-card{background:white;border:1px solid var(--line);border-radius:9px;padding:24px;margin:16px 0}.report-card[hidden]{display:none}.report-card h2{font-size:23px;line-height:1.55;margin:8px 0}.report-card h2 a{color:var(--ink);text-decoration:none}.report-card h2 a:hover{color:var(--green)}.report-card p{font-size:15px;color:#4f6458;margin:10px 0}.report-card .tags{font-size:12px;color:var(--muted)}.report-card .read-link{font-size:13px}.no-result{color:var(--muted);font-size:14px}@media(max-width:800px){.report-shell{display:block;padding:24px 20px 50px}.toc-desktop{display:none}.toc-mobile{display:block;margin:20px 0 24px;border:1px solid var(--line);border-radius:6px;background:#edf2e9;padding:10px 14px}.toc-mobile summary{cursor:pointer;font-size:13px;color:var(--green);min-height:24px}.toc-mobile .toc-links{margin-top:12px}.toc-mobile .toc-links a{font-size:13px;padding:9px}.header-inner{padding:0 16px;min-height:62px;gap:10px}.brand strong{font-size:14px}.brand svg{width:28px;height:28px}.site-nav{gap:14px}.site-nav a{font-size:12px}h1{font-size:29px}.subtitle{font-size:16px}.article-body{font-size:16px}.article-body h2{font-size:21px;margin-top:38px}.metadata{font-size:11px;gap:4px 10px}.article-body pre{padding:12px;font-size:12px}.listing{padding:0 20px}.listing h1{font-size:27px}.report-card{padding:18px}.report-card h2{font-size:21px}.table-scroll{margin-left:0;margin-right:0}td,th{padding:10px 12px}}@media(max-width:360px){.brand svg{display:none}.site-nav{gap:10px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{body{background:white;font-size:11pt;line-height:1.65}.site-header,.toc-desktop,.toc-mobile,.tools,.skip-link,.back-top,.related{display:none!important}.report-shell{display:block;max-width:none;padding:0}.article-body{font-size:11pt}.article-body h2{break-after:avoid;font-size:16pt;margin-top:26px}.article-body h3{break-after:avoid}h1{font-size:24pt}.table-scroll{overflow:visible;border:0}table{min-width:0;font-size:9pt}thead{display:table-header-group}tr{break-inside:avoid}pre{white-space:pre-wrap}.references{font-size:9pt}a{color:inherit}sup{font-size:8pt}@page{size:A4;margin:18mm}}`;
const js = `(()=>{const q=s=>document.querySelector(s);q('#print-report')?.addEventListener('click',()=>window.print());q('#copy-link')?.addEventListener('click',async e=>{const b=e.currentTarget;try{await navigator.clipboard.writeText(location.href);b.textContent='已复制'}catch{b.textContent='请复制地址栏链接'}setTimeout(()=>b.textContent='复制链接',2200)});const progress=q('#reading-progress');if(progress){const tick=()=>{const span=document.documentElement.scrollHeight-innerHeight;progress.style.width=(span>0?Math.min(100,scrollY/span*100):0)+'%'};addEventListener('scroll',tick,{passive:true});addEventListener('resize',tick);tick()}if('IntersectionObserver'in window){const links=[...document.querySelectorAll('.toc-links a')];const observer=new IntersectionObserver(entries=>{const visible=entries.filter(x=>x.isIntersecting);if(!visible.length)return;const id=visible[0].target.id;links.forEach(a=>{if(a.getAttribute('href')==='#'+id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')})},{rootMargin:'-90px 0px -65% 0px'});document.querySelectorAll('.article-body h2').forEach(h=>observer.observe(h))}q('#report-search')?.addEventListener('input',e=>{const term=e.target.value.trim().toLowerCase();let n=0;document.querySelectorAll('.report-card').forEach(card=>{card.hidden=!card.textContent.toLowerCase().includes(term);if(!card.hidden)n++});q('#report-count').textContent=n+' 篇';q('#no-result').hidden=n>0})})();`;

const logo = `<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 5 33 12.5v15L20 35 7 27.5v-15Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m7 12.5 13 8 13-8M20 20.5V35" stroke="currentColor" stroke-width="2"/><path d="m14 9.5 13 8v7" stroke="#74c9a5" stroke-width="2.5" stroke-linecap="round"/><circle cx="27" cy="25" r="3" fill="#74c9a5"/></svg>`;
function frame({title,description,canonical,root,body,article=false}) {
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f6f5f0"><title>${escapeHTML(title)} · 3D &amp; Robotics Insights</title><meta name="description" content="${escapeHTML(description)}"><link rel="canonical" href="${escapeHTML(canonical)}"><meta property="og:title" content="${escapeHTML(title)}"><meta property="og:description" content="${escapeHTML(description)}"><meta property="og:type" content="${article?'article':'website'}"><meta property="og:url" content="${escapeHTML(canonical)}"><link rel="stylesheet" href="${root}reports/reports.css"></head><body id="top"><a class="skip-link" href="#main">跳到正文</a><header class="site-header"><div class="header-inner"><a class="brand" href="${root}" aria-label="3D & Robotics Insights 首页">${logo}<span><strong>3D &amp; Robotics</strong><small>Insights</small></span></a><nav class="site-nav" aria-label="主导航"><a href="${root}">技术观察</a><a href="${root}reports/" aria-current="page">深度报告</a></nav></div><div class="progress" aria-hidden="true"><span id="reading-progress"></span></div></header>${body}<script src="${root}reports/reports.js" defer></script></body></html>`;
}

export function buildReports({rootDir='.',outDir='dist',siteData=null}={}) {
 const read = p=>fs.readFileSync(path.join(rootDir,p),'utf8');
 const index=JSON.parse(read('content/reports/index.json'));
 const publicURL = siteData?.site?.public_url || 'https://wqs111000.github.io/3d-robotics-insights/';
 const base = safeHref(publicURL.endsWith('/')?publicURL:publicURL+'/');
 const reports=index.reports.filter(r=>r.publish_approved===true).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
 const slugs=new Set();
 fs.rmSync(path.join(rootDir,outDir,'reports'),{recursive:true,force:true});
 const write=(p,body)=>{const full=path.join(rootDir,outDir,p);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,body)};
 write('reports/reports.css',css);write('reports/reports.js',js);
 for(const r of reports){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.slug)||slugs.has(r.slug))throw Error('Invalid/duplicate report slug');
  if(!/^[a-z0-9-]+\.md$/.test(r.content_file))throw Error('Invalid report content path');
  for(const flag of ['owner_reviewed','independently_tested'])if(typeof r[flag]!=='boolean')throw Error(`Missing evidence flag ${flag}`);
  slugs.add(r.slug);
  const md=read(`content/reports/${r.content_file}`), rendered=renderMarkdown(md);
  const toc=`<nav class="toc-links" aria-label="报告目录">${rendered.headings.map(h=>`<a href="#${h.id}">${escapeHTML(h.title)}</a>`).join('')}</nav>`;
  const related=(r.related_items||[]).map(id=>siteData?.items?.find(item=>item.id===id)).filter(Boolean);
  // Publication bookkeeping stays in the source index, not the reading interface.
  const body=`<main id="main" class="report-shell"><aside class="toc-desktop"><p class="toc-title">阅读导航</p>${toc}</aside><article class="report-article"><header><p class="eyebrow">TECHNICAL REPORT · ${escapeHTML(r.category)}</p><h1>${escapeHTML(r.title)}</h1><p class="subtitle">${escapeHTML(r.subtitle)}</p><div class="metadata"><span>资料截止 ${escapeHTML(r.research_as_of)}</span><span>${rendered.referenceCount} 条参考资料</span></div><div class="tools"><a href="report.md" download>Markdown</a><button id="print-report" type="button">打印 / PDF</button><button id="copy-link" type="button">复制链接</button></div></header><details class="toc-mobile"><summary>目录 · ${rendered.headings.length} 个章节</summary>${toc}</details><div class="article-body">${rendered.html}</div><footer class="report-footer">${related.length?`<h2>相关技术观察</h2><div class="related">${related.map(i=>`<a href="../../#item/${encodeURIComponent(i.id)}">${escapeHTML(i.name)} · ${escapeHTML(i.title)}</a>`).join('')}</div>`:''}<a class="back-top" href="#top">回到顶部 ↑</a></footer></article></main>`;
  write(`reports/${r.slug}/index.html`,frame({title:r.title,description:r.summary,canonical:`${base}reports/${r.slug}/`,root:'../../',body,article:true}));
  write(`reports/${r.slug}/report.md`,`# ${r.title}\n\n${r.subtitle}\n\n资料截止：${r.research_as_of}\n\n${md}`);
 }
 const cards=reports.map(r=>`<article class="report-card"><div class="metadata"><span>${escapeHTML(r.category)}</span><span>${escapeHTML(r.research_as_of)}</span></div><h2><a href="${r.slug}/">${escapeHTML(r.title)}</a></h2><p>${escapeHTML(r.summary)}</p><p class="tags">${r.topics.map(escapeHTML).join(' / ')}</p><a class="read-link" href="${r.slug}/">阅读全文 →</a></article>`).join('');
 write('reports/index.html',frame({title:'深度报告',description:'独立技术调研、系统路线与可验证的工程方案。',canonical:`${base}reports/`,root:'../',body:`<main id="main" class="listing"><p class="eyebrow">RESEARCH & ENGINEERING</p><h1>深度报告</h1><p class="subtitle">围绕一个问题，梳理技术路线、证据与可落地的验证方法。</p><div class="list-search"><input id="report-search" type="search" placeholder="搜索报告、主题或技术" aria-label="搜索深度报告"><span id="report-count" role="status" aria-live="polite">${reports.length} 篇</span></div>${cards}<p id="no-result" class="no-result" hidden>没有匹配的报告，试试其他关键词。</p></main>`}));
 write('reports/index.json',JSON.stringify({schema_version:index.schema_version,reports},null,2)+'\n');
 const home=path.join(rootDir,outDir,'index.html');
 if(fs.existsSync(home)){
  let html=fs.readFileSync(home,'utf8');
  const hook='<a class="header-link" href="#archive">往期</a>';
  if(!html.includes('data-reports-nav')){
   if(!html.includes(hook))throw Error('Homepage navigation hook changed; refusing silent integration');
   html=html.replace(hook,`<nav data-reports-nav aria-label="内容导航" style="display:flex;align-items:center;gap:12px"><a class="header-link" href="reports/">深度报告</a>${hook}</nav>`);
  }
  html=html.replace(/<aside class="wrap" data-report-feature[\s\S]*?<\/aside>/g,'');
  if(reports.length){
   const marker='<section class="wrap archive-section"',r=reports[0];
   if(!html.includes(marker))throw Error('Homepage report hook changed');
   html=html.replace(marker,`<aside class="wrap" data-report-feature style="border-top:1px solid var(--line);padding:20px 0 24px"><p style="font-size:12px;color:var(--muted);margin:0 0 6px">深度报告 · 独立专题</p><a href="reports/${r.slug}/" style="font-size:17px;color:var(--ink);font-weight:600;text-decoration:none">${escapeHTML(r.title)} →</a><p style="font-size:13px;color:var(--muted);margin:6px 0 0">${escapeHTML(r.subtitle)}</p></aside>${marker}`);
  }
  fs.writeFileSync(home,html);
 }
 console.log(`Built ${reports.length} approved report(s); observation data unchanged`);
 return {reportCount:reports.length};
}
