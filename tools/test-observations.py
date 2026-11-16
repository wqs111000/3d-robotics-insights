"""Presentation/content regression checks for the observation reader."""
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=set(); self.anchors=[]; self.images=[]; self.text=[]; self.figures=0; self.article=False
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='article': self.article=True
        if 'id' in a:
            if a['id'] in self.ids: raise AssertionError('Duplicate id '+a['id'])
            self.ids.add(a['id'])
        if tag=='a': self.anchors.append(a)
        if tag=='img': self.images.append(a)
        if tag=='figure': self.figures+=1
    def handle_endtag(self,tag):
        if tag=='article': self.article=False
    def handle_data(self,data):
        if self.article: self.text.append(data)

data=json.loads((ROOT/'content/articles.json').read_text())
notes=json.loads((ROOT/'content/observations/reading-notes.json').read_text())['items']
manifest=json.loads((ROOT/'dist/observations/enrichment.json').read_text())
ids={i['id'] for i in data['items']}
expected=ids.intersection(notes)
assert expected=={i['id'] for i in manifest['articles']}
checks=0
for item in data['items']:
    if item['id'] not in expected: continue
    file=ROOT/'dist/observations'/item['id']/'index.html'
    raw=file.read_text(); page=Page(); page.feed(raw)
    assert 'data-expanded="true"' in raw
    assert all(k in page.ids for k in ['main','problem','mechanism','difference','evidence','experiment','sources'])
    assert page.figures>=1
    assert '<table>' in raw and 'aria-label="技术方案对照表"' in raw
    assert raw.count('class="step-label"')>=3
    assert 'GPT 辅助整理' not in raw and '<h2>修订记录</h2>' not in raw
    assert not re.search(r'file_[0-9a-f]+|chatgpt.com/share',raw)
    assert all(a['href'][1:] in page.ids for a in page.anchors if a.get('href','').startswith('#'))
    assert all(i.get('alt') and i.get('width') and i.get('height') for i in page.images)
    for image in page.images:
        target=(file.parent/image['src']).resolve()
        assert target.is_relative_to((ROOT/'dist').resolve()) and target.is_file()
    assert len(''.join(page.text))>800, item['id']
    checks+=10
for fig in manifest['figures']:
    assert hashlib.sha256((ROOT/'dist'/fig['path']).read_bytes()).hexdigest()==fig['sha256']
    checks+=1
home=(ROOT/'dist/index.html').read_text()
assert '<h1>技术观察</h1>' in home
js=(ROOT/'app.js').read_text()
assert 'location.replace(articleURL(id))' in js
assert 'dialog.showModal' not in js
assert 'href="${articleURL(i.id)}"' in js
checks+=4
print(json.dumps({'status':'passed','articles':len(expected),'figures':len(manifest['figures']),'checks':checks},ensure_ascii=False))
