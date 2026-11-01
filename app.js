'use strict';
(() => {
  const data = JSON.parse(document.querySelector('#radar-data').textContent);
  const $ = s => document.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : '#'; } catch { return '#'; } };
  const fmt = value => value ? String(value).replaceAll('-', '.') : '未记录';
  const topics = Object.fromEntries(data.topics.map(t => [t.id,t]));
  const issues = [...data.issues].sort((a,b) => b.date.localeCompare(a.date));
  const state = {view:'radar', topic:'all', query:'', evidence:'all', issue:issues[0]?.id};
  const dialog = $('#detail-dialog');
  let toastTimer;
  const evidenceText = item => item.independently_tested ? '独立实测有记录' : item.evidence === 'public_material_checked' ? '公开资料已核对' : '作者宣称 · 待核对';
  const toast = text => { const el=$('#toast'); el.textContent=text; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('visible'),3000); };
  function selectedItems() {
    return issues.find(i=>i.id===state.issue)?.snapshots || data.items;
  }
  function filteredItems() {
    const query=state.query.trim().toLocaleLowerCase();
    return selectedItems().filter(i => (state.topic==='all'||i.topic===state.topic) && (!state.issue||i.issue_ids.includes(state.issue)) && (state.evidence==='all'||(state.evidence==='tested'?i.independently_tested:i.evidence===state.evidence)) && (!query||[i.name,i.title,i.summary,i.judgment,i.limitations,i.experiment,...i.tags,...i.facts.map(f=>f.text)].join(' ').toLocaleLowerCase().includes(query))).sort((a,b)=>a.order-b.order);
  }
  function renderTopics() {
    const options=[{id:'all',label:'全部方向'},...data.topics];
    $('#topics').innerHTML=options.map(t=>`<button class="topic-button ${state.topic===t.id?'active':''}" data-topic="${esc(t.id)}" aria-pressed="${state.topic===t.id}">${esc(t.label)}<span>${t.id==='all'?data.items.length:data.items.filter(i=>i.topic===t.id).length}</span></button>`).join('');
  }
  function renderCards() {
    const list=filteredItems();
    $('#result-count').textContent=`${list.length} 个观察对象 · ${state.topic==='all'?'全部方向':topics[state.topic].label}`;
    $('#cards').innerHTML=list.map(i=>`<article class="research-card" data-item="${esc(i.id)}"><div class="card-topline"><span class="topic-tag">${esc(topics[i.topic].short)}</span><span class="baseline-tag">${i.change_kind==='baseline'?'基线收录':'实质更新'}</span></div><div class="project-name">${esc(i.name)}</div><h3>${esc(i.title)}</h3><p class="summary">${esc(i.summary)}</p><div class="tags">${i.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="card-evidence"><span aria-hidden="true">✓</span>${esc(evidenceText(i))}<span>${i.independently_tested?'实测记录见详情':'未独立实测'}</span></div><div class="card-footer"><small>核查 ${fmt(i.checked_on)}</small><button class="detail-button" data-detail="${esc(i.id)}" aria-label="查看 ${esc(i.name)} 的工程笔记">工程笔记 <span aria-hidden="true">↗</span></button></div></article>`).join('');
    $('#empty').hidden=list.length!==0;
  }
  function renderTracking() {
    $('#watchlist').innerHTML=data.items.map(i=>`<article class="watch-card"><div class="watch-heading"><h3>${esc(i.name)}</h3><button class="detail-button" data-detail="${esc(i.id)}">查看笔记 ↗</button></div><p>${esc(i.watch)}</p><div class="watch-meta"><span>${esc(topics[i.topic].label)}</span><span>首次收录 ${fmt(i.first_added)}</span><span>核查 ${fmt(i.checked_on)}</span><span>修订 ${i.revision}</span></div><div class="timeline">${i.changes.map(c=>`<div><span>${fmt(c.date)}</span>${esc(c.note)}</div>`).join('')}</div></article>`).join('');
  }
  function renderArchive() {
    $('#archives').innerHTML=issues.map((issue,idx)=>`<article class="archive-card"><span class="archive-index">${String(issues.length-idx).padStart(3,'0')}</span><div><h4>${esc(issue.title)}</h4><p>${fmt(issue.date)} · ${issue.item_ids.length} 个对象 · ${issue.status==='published'?'已发布':'待发布样稿'}</p></div><button class="detail-button" data-issue="${esc(issue.id)}">阅读本期 ↗</button></article>`).join('');
  }
  function setView(view, updateHash=true) {
    if(!['radar','tracking','archive'].includes(view))view='radar';
    state.view=view;
    for (const v of ['radar','tracking','archive']) $(`#${v}-view`).hidden=v!==view;
    document.querySelectorAll('nav [data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);if(el.dataset.view===view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    if(updateHash)history.replaceState(null,'',`#${view}`);
  }
  function reset(){state.topic='all';state.query='';state.evidence='all';state.issue=issues[0]?.id;$('#search').value='';$('#evidence').value='all';renderTopics();renderCards();}
  function openDetail(id) {
    const item=(state.view==='radar'?selectedItems():data.items).find(i=>i.id===id); if(!item)return;
    const sources=Object.fromEntries(item.sources.map(s=>[s.id,s]));
    const refs=ids=>ids.map(sid=>sources[sid]?`<a class="cite-link" href="${esc(safeURL(sources[sid].url))}" target="_blank" rel="noopener noreferrer" aria-label="查看支持本条事实的原始来源">[来源]</a>`:'').join('');
    $('#detail-content').innerHTML=`<div class="detail-head"><div class="topic-tag">${esc(topics[item.topic].label)}</div><div class="project-name">${esc(item.name)}</div><h2 id="detail-title">${esc(item.title)}</h2><p class="detail-summary">${esc(item.summary)}</p><div class="detail-status"><span class="status-pill">${esc(evidenceText(item))}</span><span class="status-pill warn">${item.owner_reviewed?'本人已确认审阅':'待本人审阅'}</span><span class="status-pill warn">${item.independently_tested?'含独立实测记录':'未独立实测'}</span></div></div><div class="detail-block"><h3>公开资料事实 <span>SOURCE CHECK</span></h3>${item.facts.map(f=>`<p class="fact">${esc(f.text)} ${refs(f.source_ids)}</p>`).join('')}<p class="small-print">${esc(item.date_label)}：${item.event_date?fmt(item.event_date):'未提供准确日期'} · 本站核查：${fmt(item.checked_on)}</p></div><div class="detail-block"><h3>为什么值得关注 <span>EDITORIAL SUGGESTION</span></h3><p>${esc(item.judgment)}</p><p class="small-print">上面是基于公开资料提出的编辑建议，不是实验结论。</p></div><div class="detail-block"><h3>证据边界与未确认项</h3><p>${esc(item.limitations)}</p></div><div class="experiment"><h3>下一步最小验证 · 尚未执行</h3><p>${esc(item.experiment)}</p></div><div class="detail-block"><h3>原始来源</h3><div class="source-list">${item.sources.map(s=>`<a href="${esc(safeURL(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗<span>${esc(new URL(s.url).hostname)} · ${esc(s.scope)} · 核查 ${fmt(s.checked_on)}</span></a>`).join('')}</div></div><div class="detail-block"><h3>跟踪记录</h3><div class="detail-history">${item.changes.map(c=>`<div>${fmt(c.date)} · ${esc(c.note)}</div>`).join('')}</div></div>`;
    if(!dialog.open)dialog.showModal();
    dialog.scrollTop=0;
  }
  function makeMarkdown(list) {
    let text=`# ${data.site.name}\n\n${issues.find(i=>i.id===state.issue)?.title||'筛选结果'}\n\n内容整理：${data.site.last_content_update}。${data.site.disclaimer}\n\n发布状态：${data.site.status==='published'?'已发布':'待发布'}；公开网址：${data.site.public_url||'尚未取得'}。\n\n`;
    for(const i of list){text+=`## ${i.name}｜${i.title}\n\n专题：${topics[i.topic].label}；证据：${evidenceText(i)}；本人审阅：${i.owner_reviewed?'已确认':'未确认'}；独立实测：${i.independently_tested?'有记录':'未进行'}。\n\n${i.summary}\n\n**公开资料事实**\n\n`;for(const f of i.facts){text+=`${f.text} `+f.source_ids.map(sid=>{const s=i.sources.find(s=>s.id===sid);return s?`[来源](${s.url})`:''}).join(' ')+`\n\n`;}text+=`**编辑建议（非实验结论）**：${i.judgment}\n\n**限制与未知**：${i.limitations}\n\n**最小验证（尚未执行）**：${i.experiment}\n\n**持续跟踪**：${i.watch}\n\n${i.date_label}：${i.event_date||'日期未知'}；本站核查：${i.checked_on}。\n\n---\n\n`;}
    return text;
  }
  function download(name,content,type) {
    const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a');if(!target)return;
    if(target.dataset.view){setView(target.dataset.view);if(!target.closest('nav'))$('#workspace').scrollIntoView();}
    if(target.dataset.topic){state.topic=target.dataset.topic;setView('radar');renderTopics();renderCards();}
    if(target.dataset.detail)openDetail(target.dataset.detail);
    if(target.dataset.issue){reset();state.issue=target.dataset.issue;renderCards();setView('radar');$('#workspace').scrollIntoView();}
  });
  $('#search').addEventListener('input',e=>{state.query=e.target.value;renderCards();});
  $('#evidence').addEventListener('change',e=>{state.evidence=e.target.value;renderCards();});
  $('#reset-filters').addEventListener('click',reset);$('#empty-reset').addEventListener('click',reset);
  $('#close-dialog').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  $('#export-md').addEventListener('click',()=>{const list=filteredItems();if(!list.length){toast('当前没有可导出的条目');return;}download(`radar-${data.site.last_content_update}.md`,makeMarkdown(list),'text/markdown;charset=utf-8');toast('已生成当前筛选内容的 Markdown');});
  $('#export-json').addEventListener('click',()=>{download('radar.json',JSON.stringify(data,null,2)+'\n','application/json');toast('已生成完整内容数据，不含账号或密钥');});
  const updatePrompt='请更新 3D & Robotics Insights。读取原站点内容或我提供的 radar.json，只检索并收录值得跟进的实质变化，保留历史与原始来源，区分作者宣称、资料核对和本人实测。不使用额外 GPT API，不购买 credits、域名或服务。输出更新稿与可合并数据；待本人审核后更新 GitHub 仓库 wqs111000/3d-robotics-insights，推送 main 后由 GitHub Actions 部署。不得把未经审核的内容发布。';
  $('#copy-update').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(updatePrompt);toast('更新指令已复制；此操作未启动后台更新');}catch{$('#copy-text').value=updatePrompt;$('#copy-dialog').showModal();$('#copy-text').select();}});
  $('#close-copy').addEventListener('click',()=>$('#copy-dialog').close());
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!dialog.open&&!$('#copy-dialog').open&&!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)){e.preventDefault();setView('radar');$('#search').focus();}});
  window.addEventListener('hashchange',()=>{const hash=location.hash.slice(1);if(hash.startsWith('item/'))openDetail(decodeURIComponent(hash.slice(5)));else setView(hash,false);});
  if(issues[0]) {
    const latest=issues[0];
    $('#issue-meta').innerHTML=`<span class="dot mint"></span>FIELD NOTES <span class="separator">/</span> ISSUE ${esc(latest.number||'001')} <span class="separator">/</span> ${fmt(latest.date)}`;
    $('#issue-number').textContent=latest.number||'001';
    $('#issue-focus').textContent=latest.focus_title||latest.title;
    $('#issue-context').textContent=latest.focus_summary||latest.description;
    $('#browse-issue').innerHTML=`浏览${latest.kind==='baseline'?'本期基线':'本期精选'} <span aria-hidden="true">↘</span>`;
    $('.draft-label').textContent=latest.kind==='baseline'?'基线版':'更新版';
    document.title=`3D & Robotics Insights · ${latest.title}`;
  }
  $('#stat-items').textContent=data.items.length;
  $('#stat-topics').textContent=data.topics.length;
  $('#stat-tests').textContent=data.items.filter(i=>i.independently_tested).length;
  if(data.site.status==='published'&&data.site.public_url&&data.site.published_at){$('#stage-banner').textContent=`内容发布于 ${data.site.published_at} · 公开资料核对不等于本人实测`;$('#public-status').textContent=data.site.public_url;}
  renderTopics();renderCards();renderTracking();renderArchive();
  const initialHash=location.hash.slice(1);setView(initialHash.startsWith('item/')?'radar':initialHash,false);if(initialHash.startsWith('item/'))openDetail(decodeURIComponent(initialHash.slice(5)));
  // Intentionally no fetch(), model endpoint, remote script, account storage or telemetry.
})();
