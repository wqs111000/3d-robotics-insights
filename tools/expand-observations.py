"""Enrich existing static observations; never mutate source records or archives."""
import hashlib
import html
import json
import re
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit
from illustrate import image_info

ROOT = Path(__file__).resolve().parent.parent
HOSTS = {'raw.githubusercontent.com', 'media.githubusercontent.com'}
SLUG = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')
STYLE = '''
html{scroll-behavior:smooth;scroll-padding-top:24px}body{overflow-wrap:anywhere}.skip{position:absolute;left:-10000px}.skip:focus{left:16px;top:5px;background:white;padding:10px;z-index:20}
.breadcrumb{font-size:12px;margin:0 0 24px}.breadcrumb a{text-decoration:none}.article-nav{display:flex;flex-wrap:wrap;gap:7px 18px;border-block:1px solid var(--line);padding:12px 0;margin:24px 0;font-size:13px}.article-nav a{text-decoration:none}
.takeaway{border-left:3px solid var(--green);padding:13px 17px;background:#edf3ec;margin:24px 0;font-size:16px;line-height:1.85}.takeaway strong{color:var(--green);display:block;font-size:12px;margin-bottom:4px}
h3{font-size:17px;line-height:1.6;margin:25px 0 7px}section{scroll-margin-top:20px}.step-label{font-size:12px;color:var(--green);margin-right:9px}.table-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:7px;background:white;margin:20px 0}table{border-collapse:collapse;width:100%;min-width:570px;font-size:14px;line-height:1.8}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:12px 14px}th{background:#edf2e9;font-weight:600}tr:last-child td{border-bottom:0}th:first-child{width:19%}.table-note,.flow-note{font-size:12px;color:var(--muted)}
.paper-figure{margin:28px 0;padding:12px;background:white;border:1px solid var(--line);border-radius:8px}.paper-figure a.figure-open{display:block;line-height:0}.paper-figure img{display:block;max-width:100%;width:100%;height:auto}.paper-figure figcaption{font-size:13px;line-height:1.85;color:#52675b;padding:13px 4px 2px}.figure-credit{display:block;font-size:11px;margin-top:7px}.figure-credit a{text-decoration:none}
.experiment-steps{padding-left:22px}.experiment-steps li{margin:12px 0}.metrics{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.metrics span{font-size:12px;border:1px solid var(--line);border-radius:4px;padding:5px 9px;background:white}.facts-note{padding:10px 14px;border-left:2px solid #a5b8ac;background:#f0f2ec}.sources li{scroll-margin-top:24px}.sources li:target{background:#e7f0e5}.related-reading{display:flex;flex-wrap:wrap;gap:9px 18px}.related-reading a{font-size:14px}.article-content p{line-height:1.95}a:focus-visible,summary:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--green);outline-offset:4px}
.mechanism svg{max-width:100%;width:100%;height:auto}.mechanism-scroll{min-width:0}.mechanism figcaption{padding-top:8px}
@media(max-width:700px){h1{font-size:26px}.takeaway{font-size:15px;padding:12px 14px}.article-nav{gap:8px 14px}.paper-figure{padding:8px;margin:23px 0}.paper-figure figcaption{font-size:12px}.mechanism svg{min-width:680px;width:680px;height:auto}.mechanism-scroll{overflow-x:auto}.breadcrumb{margin-bottom:18px}.article-content p{font-size:16px}.table-scroll{width:100%}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{.skip,.article-nav,.breadcrumb,.last{display:none}.table-scroll{overflow:visible}table{min-width:0;font-size:10pt}.mechanism svg{min-width:0;max-width:100%}.paper-figure{break-inside:avoid}.paper-figure img{max-height:150mm;object-fit:contain}.takeaway{break-inside:avoid}h2,h3{break-after:avoid}}
'''

def esc(value):
    return html.escape(str(value or ''), quote=True)


def safe_url(value, hosts=None):
    parts = urlsplit(value)
    if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password:
        raise ValueError('Expected HTTPS URL without credentials')
    if hosts and parts.hostname not in hosts:
        raise ValueError('Host not allowlisted')
    return value


def download(url):
    safe_url(url, HOSTS)
    request = urllib.request.Request(url, headers={'User-Agent': 'Insights-Static-Research/1.0'})
    with urllib.request.urlopen(request, timeout=20) as response:
        safe_url(response.geturl(), HOSTS)
        data = response.read(16 * 1024 * 1024 + 1)
    if not data or len(data) > 16 * 1024 * 1024:
        raise ValueError('Image size rejected')
    image_info(data)
    return data


def prepare_figure(root, slug, spec, downloader):
    safe_url(spec['source'])
    if 'copy_from' in spec:
        rel = spec['copy_from']
        if not re.fullmatch(r'reports/assets/[a-z0-9-]+\.(png|jpg|gif)', rel):
            raise ValueError('Unsafe local figure path')
        data = (root / 'dist' / rel).read_bytes()
    else:
        data = downloader(spec['url'])
    kind, width, height = image_info(data)
    relative = 'observations/assets/' + slug + '.' + kind
    target = root / 'dist' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {**spec, 'path': relative, 'width': width, 'height': height,
            'sha256': hashlib.sha256(data).hexdigest()}


def figure_markup(fig):
    if not fig:
        return ''
    url = '../assets/' + Path(fig['path']).name
    license_text = ''
    if fig.get('license_url'):
        license_text = ' · <a href="' + esc(safe_url(fig['license_url'])) + '">' + esc(fig['license']) + '</a>'
    return ('<figure class="paper-figure"><a class="figure-open" href="' + url + '" target="_blank" rel="noopener" aria-label="查看原尺寸图片：' + esc(fig['alt']) + '">'
            '<img src="' + url + '" alt="' + esc(fig['alt']) + '" width="' + str(fig['width']) + '" height="' + str(fig['height']) + '" loading="lazy" decoding="async"></a>'
            '<figcaption>' + esc(fig['caption']) + '<span class="figure-credit">来源：<a href="' + esc(fig['source']) + '" target="_blank" rel="noopener noreferrer">' + esc(fig['credit']) + '</a>' + license_text + '</span></figcaption></figure>')


def build(root=ROOT, downloader=download):
    root = Path(root)
    original = (root / 'content/articles.json').read_bytes()
    data = json.loads(original)
    notes = json.loads((root / 'content/observations/reading-notes.json').read_text())['items']
    topics = {t['id']: t['label'] for t in data['topics']}
    report_meta = root / 'content/reports/index.json'
    public_reports = {r['slug'] for r in json.loads(report_meta.read_text())['reports'] if r.get('publish_approved')} if report_meta.exists() else set()
    result = {'articles': [], 'figures': [], 'image_warnings': []}
    for item in data['items']:
        slug = item['id']
        if not SLUG.fullmatch(slug):
            raise ValueError('Unsafe article ID')
        if slug not in notes:
            continue
        n = notes[slug]
        if len(n['mechanism']) < 3 or len(n['comparison']) < 3:
            raise ValueError('Incomplete technical explanation: ' + slug)
        page = root / 'dist/observations' / slug / 'index.html'
        old = page.read_text()
        diagram = re.search(r'<figure class="mechanism"[\s\S]*?</figure>', old)
        if not diagram:
            raise ValueError('Existing mechanism diagram absent: ' + slug)
        diagram = diagram.group().replace('技术机制示意 · 据原始研究内容整理', '方法示意 · 按公开资料整理')
        figure = None
        if n.get('figure'):
            try:
                figure = prepare_figure(root, slug, n['figure'], downloader)
                result['figures'].append({'article_id': slug, **figure})
            except Exception as exc:
                result['image_warnings'].append({'article_id': slug, 'reason': str(exc)})
                print('Figure unavailable; original schematic retained:', slug, str(exc), flush=True)
        sources = [dict(s) for s in item.get('sources', [])]
        source_urls = {s['url'] for s in sources}
        for j, s in enumerate(n.get('sources', [])):
            if s['url'] not in source_urls:
                sources.append({'id': 'explanation-' + str(j), **s})
                source_urls.add(s['url'])
        by_id = {s['id']: k+1 for k, s in enumerate(sources)}
        for s in sources:
            safe_url(s['url'])
        citations = ''.join('<a class="cite" href="#source-' + str(k+1) + '">[' + str(k+1) + ']</a> ' for k, _ in enumerate(sources))
        methods = ''.join('<h3><span class="step-label">0' + str(k+1) + '</span>' + esc(m['title']) + '</h3><p>' + esc(m['text']) + '</p>' for k, m in enumerate(n['mechanism']))
        rows = ''.join('<tr>' + ''.join('<td>' + esc(c) + '</td>' for c in row) + '</tr>' for row in n['comparison'])
        facts = ''
        for f in item.get('facts', []):
            refs = []
            for source_id in f.get('source_ids', []):
                if source_id not in by_id:
                    raise ValueError('Broken claim source: ' + slug)
                num = by_id[source_id]
                refs.append('<a class="cite" href="#source-' + str(num) + '">[' + str(num) + ']</a>')
            facts += '<p class="fact">' + esc(f['text']) + ' ' + ' '.join(refs) + '</p>'
        reference_list = ''.join('<li id="source-' + str(k+1) + '"><a href="' + esc(s['url']) + '" target="_blank" rel="noopener noreferrer">[' + str(k+1) + '] ' + esc(s['label']) + '</a></li>' for k,s in enumerate(sources))
        related_slugs = [('vision-language-navigation','视觉语言导航技术深度调研'),('mobile-manipulation','移动操作技术深度调研')]
        if item['topic'] in ('slam','reconstruction','simulation'):
            related_slugs.reverse()
        related = ''.join('<a href="../../reports/' + s + '/">' + t + ' →</a>' for s,t in related_slugs if s in public_reports)
        first = esc(item.get('date_label') or '事件日期') + ' ' + esc(item.get('event_date') or '未注明')
        experiment_steps = [item.get('experiment','先固定输入、环境与比较基线。'), '使用相同输入、任务和预算，一次只改变上文对照表中的一个因素，保留失败样本而非只保存成功截图。', '同时记录收益、运行代价和异常情况；结果不足时维持待验证结论，不把作者成绩直接作为本地性能。']
        body = ('<a class="skip" href="#main">跳到正文</a><main id="main"><article class="article-content" data-expanded="true">'
          '<p class="breadcrumb"><a href="../../#articles">技术观察</a> / ' + esc(topics.get(item['topic'],'')) + '</p>'
          '<p class="eyebrow">' + esc(item['name']) + '</p><h1>' + esc(item['title']) + '</h1><p class="sub">' + esc(item['summary']) + '</p>'
          '<div class="metadata"><span>' + first + '</span><span>原条目核查 ' + esc(item.get('checked_on','未注明')) + '</span></div>'
          '<div class="takeaway"><strong>阅读重点</strong>' + esc(n['focus']) + '</div>'
          '<nav class="article-nav" aria-label="文章导航"><a href="#problem">研究问题</a><a href="#mechanism">技术机制</a><a href="#difference">方案对照</a><a href="#evidence">证据与边界</a><a href="#experiment">最小验证</a></nav>'
          '<section id="problem"><h2>要解决什么问题</h2><p>' + esc(n['problem']) + '</p></section>'
          '<section id="mechanism"><h2>关键技术怎么工作</h2>' + figure_markup(figure) + diagram + methods + '<p class="flow-note">机制与工程解读依据：' + citations + '</p></section>'
          '<section id="difference"><h2>与常见做法相比，改变在哪里</h2><div class="table-scroll" role="region" tabindex="0" aria-label="技术方案对照表"><table><thead><tr><th>对照维度</th><th>常见简化做法</th><th>本项值得关注的处理</th></tr></thead><tbody>' + rows + '</tbody></table></div><p class="table-note">按设计思路对照，不代表统一条件下的性能排名。</p></section>'
          '<section id="evidence"><h2>已公开的证据与适用边界</h2>' + facts + '<h3>工程上怎样解读</h3><p>' + esc(item.get('judgment','')) + '</p><p class="facts-note">' + esc(item.get('limitations','未独立实测。')) + '</p></section>'
          '<section id="experiment"><h2>怎样做一个最小验证</h2><ol class="experiment-steps">' + ''.join('<li>' + esc(x) + '</li>' for x in experiment_steps) + '</ol><div class="metrics" aria-label="建议记录的指标">' + ''.join('<span>' + esc(x) + '</span>' for x in n['metrics']) + '</div></section>' +
          ('<section id="watch"><h2>下一步跟踪重点</h2><p>' + esc(item['watch']) + '</p></section>' if item.get('watch') else '') +
          '<section id="sources"><h2>原始资料</h2><ul class="sources">' + reference_list + '</ul></section>' +
          ('<section><h2>延伸阅读</h2><div class="related-reading">' + related + '</div></section>' if related else '') +
          '<footer class="last"><a href="../../#articles">返回技术观察</a><a href="#main">回到顶部 ↑</a></footer></article></main>')
        new, count = re.subn(r'<main>.*?</main>', lambda _: body, old, count=1, flags=re.S)
        if count != 1:
            raise ValueError('Unexpected observation template')
        new = new.replace('</style>', STYLE + '</style>', 1)
        page.write_text(new)
        result['articles'].append({'id':slug,'path':'observations/' + slug + '/', 'sections': 8,'method_parts':len(n['mechanism']),'has_source_image':figure is not None})
    if original != (root / 'content/articles.json').read_bytes():
        raise RuntimeError('Historical research records were modified')
    manifest = root / 'dist/observations/enrichment.json'
    manifest.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('Expanded', len(result['articles']), 'observations;', len(result['figures']), 'source images;', len(result['image_warnings']), 'image warnings', flush=True)
    return result

if __name__ == '__main__':
    build()
