"""Render explicit source titles without altering research records or their URLs.

The title catalog is checked editorially; no model API or runtime title scraping
is used. Unknown paper/document titles fail the build rather than being invented.
"""
import argparse
import hashlib
import html
import json
import os
import re
import urllib.request
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parent.parent
SOURCE_LIST = re.compile(r'(<ul\b[^>]*\bclass="sources"[^>]*>)(.*?)(</ul>)', re.S)
LINK = re.compile(r'<a\b[^>]*\bhref="([^"]+)"[^>]*>(.*?)</a>', re.S)
CSS = '''<style id="source-title-styles">
.sources .source-title{display:inline;font-size:15px;line-height:1.8;white-space:normal;overflow-wrap:anywhere;word-break:normal}
.sources .source-kind{display:inline-block;font-size:11px;line-height:1.5;color:var(--muted);margin-left:9px;text-decoration:none;vertical-align:baseline}
.sources .source-status{display:block;color:var(--muted);font-size:12px;line-height:1.7;margin-top:4px}
@media(max-width:600px){.sources .source-title{font-size:14px}.sources li{padding:13px 0}}
</style>'''


def key(url):
    u = urlsplit(url)
    if u.scheme != 'https' or not u.hostname or u.username or u.password:
        raise ValueError('Source must use HTTPS without credentials')
    return 'https://' + u.netloc.lower() + u.path.rstrip('/')


def resolve(source, catalog):
    url = source['url']
    normalized = key(url)
    record = catalog['pages'].get(normalized)
    if record:
        return dict(record)
    u = urlsplit(url)
    if u.hostname in ('arxiv.org', 'www.arxiv.org', 'export.arxiv.org'):
        match = re.fullmatch(r'/(?:abs|html|pdf)/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?/?', u.path)
        if not match or match[1] not in catalog['papers']:
            raise ValueError('Add the verified paper title to source-titles.json: ' + url)
        return {'title': catalog['papers'][match[1]], 'kind': 'arXiv'}
    if u.hostname == 'github.com':
        parts = [unquote(p) for p in u.path.strip('/').split('/') if p]
        if not parts or any(not re.fullmatch(r'[\w.\-]+', p) for p in parts):
            raise ValueError('Unsupported GitHub resource: ' + url)
        if len(parts) == 1:
            return {'title': parts[0], 'kind': 'GitHub 组织'}
        title = '/'.join(parts[:2])
        if len(parts) > 2:
            title += ' — ' + '/'.join(parts[2:])
        return {'title': title, 'kind': 'GitHub'}
    raise ValueError('Add the verified document/project title to source-titles.json: ' + url)


def source_records(item, notes):
    sources = [dict(s) for s in item.get('sources', [])]
    known = {s['url'] for s in sources}
    for source in notes.get(item['id'], {}).get('sources', []):
        if source['url'] not in known:
            sources.append(dict(source))
            known.add(source['url'])
    return sources


def markup(sources, catalog):
    result = []
    for n, source in enumerate(sources, 1):
        record = resolve(source, catalog)
        title, kind = record['title'], record['kind']
        if not title.strip() or not kind.strip():
            raise ValueError('Empty source title/type')
        note = record.get('status_note', '')
        result.append(
            '<li id="source-' + str(n) + '"><a class="source-title" href="' + html.escape(source['url'], quote=True) +
            '" target="_blank" rel="noopener noreferrer">[' + str(n) + '] ' + html.escape(title) + '</a>' +
            '<span class="source-kind">' + html.escape(kind) + '</span>' +
            ('<small class="source-status">' + html.escape(note) + '</small>' if note else '') + '</li>')
    return ''.join(result)


def rewrite(page, sources, catalog):
    matches = list(SOURCE_LIST.finditer(page))
    if len(matches) != 1:
        raise ValueError('Expected exactly one original-sources section')
    m = matches[0]
    old_urls = [html.unescape(a[0]) for a in LINK.findall(m[2])]
    if old_urls != [s['url'] for s in sources]:
        raise ValueError('Source order changed; refusing to renumber citations')
    result = page[:m.start(2)] + markup(sources, catalog) + page[m.end(2):]
    if 'id="source-title-styles"' not in result:
        result = result.replace('</head>', CSS + '</head>', 1)
    return result


def load(root):
    data = json.loads((root/'content/articles.json').read_text(encoding='utf-8'))
    notes = json.loads((root/'content/observations/reading-notes.json').read_text(encoding='utf-8'))['items']
    catalog = json.loads((root/'content/observations/source-titles.json').read_text(encoding='utf-8'))
    return data, notes, catalog


def build(root=ROOT):
    data, notes, catalog = load(root)
    original = (root/'content/articles.json').read_bytes()
    pages, count, unique = [], 0, set()
    for item in data['items']:
        if not item.get('publish_approved'):
            continue
        slug = item['id']
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug):
            raise ValueError('Invalid observation ID')
        sources = source_records(item, notes)
        page_path = root/'dist/observations'/slug/'index.html'
        page = rewrite(page_path.read_text(encoding='utf-8'), sources, catalog)
        page_path.write_text(page, encoding='utf-8')
        if rewrite(page, sources, catalog) != page:
            raise AssertionError('Source rendering is not idempotent')
        count += len(sources)
        unique.update(s['url'] for s in sources)
        pages.append({'id': slug, 'source_count': len(sources), 'sha256': hashlib.sha256(page.encode()).hexdigest()})
    if (root/'content/articles.json').read_bytes() != original:
        raise AssertionError('Research records changed')
    result = {'article_count': len(pages), 'source_count': count, 'unique_source_count': len(unique), 'articles': pages}
    (root/'dist/observations/source-titles.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('Named source links:', json.dumps({k:v for k,v in result.items() if k != 'articles'}), flush=True)
    return result


def verify_public(root=ROOT):
    data, notes, catalog = load(root)
    base, commit = os.environ['SITE_URL'].rstrip('/')+'/', os.environ['GITHUB_SHA']
    key(base)
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Full commit SHA required')
    def get(relative):
        url = urljoin(base, relative) + '?v=' + commit
        with urllib.request.urlopen(url, timeout=25) as response:
            if response.status != 200:
                raise RuntimeError('Public resource unavailable: ' + relative)
            return response.read().decode('utf-8')
    if json.loads(get('build-info.json')).get('commit') != commit:
        raise RuntimeError('Public website is not the expected build')
    pages, links = 0, 0
    for item in data['items']:
        if not item.get('publish_approved'):
            continue
        sources = source_records(item, notes)
        page = get('observations/' + item['id'] + '/')
        match = SOURCE_LIST.search(page)
        if not match or match[2] != markup(sources, catalog):
            raise RuntimeError('Public source titles differ from verified catalog: ' + item['id'])
        pages += 1
        links += len(sources)
    print(json.dumps({'status':'verified','commit':commit,'articles':pages,'named_source_links':links}, ensure_ascii=False), flush=True)


def self_test():
    catalog = {'papers': {'2611.16205':'QVS-LIVO RiskMap: Full Paper Title'}, 'pages':{}}
    paper = {'url':'https://arxiv.org/abs/2611.16205', 'label':'作者论文 · arXiv'}
    repo = {'url':'https://github.com/zihanPan-HIT/QVS-LIVO', 'label':'作者代码'}
    assert resolve(paper,catalog)['title'].startswith('QVS-LIVO RiskMap:')
    assert resolve({'url':'https://arxiv.org/pdf/2611.16205v1.pdf'},catalog)['title'] == resolve(paper,catalog)['title']
    assert resolve(repo,catalog)['title'] == 'zihanPan-HIT/QVS-LIVO'
    original = '<head></head><p>正文 [1]</p><ul class="sources"><li id="source-1"><a href="'+paper['url']+'">[1] 作者论文</a></li></ul>'
    updated = rewrite(original,[paper],catalog)
    assert '[1] QVS-LIVO RiskMap: Full Paper Title' in updated
    assert '作者论文' not in updated
    assert '<p>正文 [1]</p>' in updated and 'id="source-1"' in updated
    assert rewrite(updated,[paper],catalog) == updated
    for bad in [{'url':'https://arxiv.org/abs/9999.99999'}, {'url':'https://example.org/unknown'}, {'url':'javascript:alert(1)'}]:
        try:
            resolve(bad,catalog)
        except ValueError:
            pass
        else:
            raise AssertionError('Unverified title/unsafe URL accepted')
    try:
        rewrite(original,[repo],catalog)
    except ValueError:
        pass
    else:
        raise AssertionError('Citation order unexpectedly changed')
    catalog['papers']['2611.16205'] = '<script> & research'
    assert '&lt;script&gt; &amp; research' in markup([paper],catalog)
    print('Source title tests passed: exact titles, versions, repository names, anchors, idempotence, escaping, unknown-title rejection.', flush=True)


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--verify-public',action='store_true')
    parser.add_argument('--test-only',action='store_true')
    args=parser.parse_args()
    self_test()
    if args.verify_public:
        verify_public()
    elif not args.test_only:
        build()
