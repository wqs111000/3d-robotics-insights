'use strict';
(() => {
 const data = JSON.parse(document.querySelector('#radar-data').textContent);
 const $ = selector => document.querySelector(selector);
 const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const topics = Object.fromEntries(data.topics.map(t => [t.id, t]));
 const issues = [...data.issues].sort((a,b) => b.date.localeCompare(a.date));
 const published = new Set(data.items.filter(i => i.publish_approved === true).map(i => i.id));
 const articleURL = id => 'observations/' + encodeURIComponent(id) + '/';
 function legacyRedirect() {
  if (!location.hash.startsWith('#item/')) return false;
  try {
   const id = decodeURIComponent(location.hash.slice(6));
   if (published.has(id)) { location.replace(articleURL(id)); return true; }
  } catch (_) {}
  return false;
 }
 if (legacyRedirect()) return;
 addEventListener('hashchange', legacyRedirect);
 const params = new URLSearchParams(location.search);
 const requested = params.get('issue');
 const state = {
  issue: requested === 'all' ? null : issues.some(i => i.id === requested) ? requested : issues[0]?.id ?? null,
  topic: topics[params.get('topic')] ? params.get('topic') : 'all', query: params.get('q') || ''
 };
 const issueData = () => issues.find(i => i.id === state.issue);
 const selected = () => (issueData()?.snapshots || data.items).filter(i => i.publish_approved === true);
 function remember() {
  const url = new URL(location.href);
  url.searchParams.set('issue', state.issue || 'all');
  if (state.topic === 'all') url.searchParams.delete('topic'); else url.searchParams.set('topic', state.topic);
  if (state.query) url.searchParams.set('q', state.query); else url.searchParams.delete('q');
  history.replaceState(null, '', url);
 }
 function renderTopics() {
  const available = data.topics.filter(t => selected().some(i => i.topic === t.id));
  if (state.topic !== 'all' && !available.some(t => t.id === state.topic)) state.topic = 'all';
  $('#topics').innerHTML = [{id:'all',label:'全部'}, ...available].map(t => `<button class="topic ${t.id === state.topic ? 'active' : ''}" data-topic="${esc(t.id)}" aria-pressed="${t.id === state.topic}">${esc(t.label)}</button>`).join('');
 }
 function renderCards() {
  const query = state.query.trim().toLowerCase();
  const items = selected().filter(i => (state.topic === 'all' || i.topic === state.topic) && (!query || [i.name,i.title,i.summary,i.judgment,...(i.tags || [])].join(' ').toLowerCase().includes(query))).sort((a,b) => (b.event_date || '').localeCompare(a.event_date || '') || (a.order || 0) - (b.order || 0));
  const issue = issueData();
  $('#issue-heading').textContent = issue ? `第 ${issue.number || issue.id.split('-').pop()} 期 · ${issue.date.replaceAll('-','.')}` : '全部内容';
  $('#result-count').textContent = `${items.length} 篇`;
  $('#cards').innerHTML = items.map(i => `<article class="card"><div class="card-top"><span class="card-category">${esc(topics[i.topic]?.label || '技术观察')}</span><span class="card-date">${esc((i.event_date || '日期未注明').replaceAll('-','.'))}</span></div><p class="project">${esc(i.name)}</p><h3><a class="card-title" style="display:block;text-decoration:none" href="${articleURL(i.id)}">${esc(i.title)}</a></h3><p class="card-summary">${esc(i.summary)}</p></article>`).join('');
  $('#empty').hidden = items.length > 0;
  $('#show-all').hidden = state.issue === null;
 }
 function renderArchive() {
  $('#archives').innerHTML = issues.map(i => `<button class="archive-item" data-issue="${esc(i.id)}"><span class="archive-number">${esc(i.number || '—')}</span><span class="archive-info"><strong>${esc(i.title.replace(/^\d+\s*·\s*/,''))}</strong><small>${esc(i.date.replaceAll('-','.'))} · ${(i.item_ids || []).length} 篇</small></span><span class="archive-arrow">↗</span></button>`).join('');
 }
 document.addEventListener('click', e => {
  const el = e.target.closest('[data-topic],[data-issue]');
  if (!el) return;
  if (el.dataset.topic) state.topic = el.dataset.topic;
  if (el.dataset.issue) { state.issue = el.dataset.issue; state.topic = 'all'; state.query = ''; $('#search').value = ''; }
  renderTopics(); renderCards(); remember();
  if (el.dataset.issue) $('#articles').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
 });
 $('#search').value = state.query;
 $('#search').addEventListener('input', e => { state.query = e.target.value; renderCards(); remember(); });
 $('#show-all').addEventListener('click', () => { state.issue = null; state.topic = 'all'; state.query = ''; $('#search').value = ''; renderTopics(); renderCards(); remember(); });
 renderTopics(); renderCards(); renderArchive();
})();
