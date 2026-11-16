"""Verify the enriched reader on the actual public site, including image bytes."""
import hashlib
import json
import os
import re
import urllib.request
from urllib.parse import urljoin
from html.parser import HTMLParser

base=os.environ['SITE_URL'].rstrip('/')+'/'
sha=os.environ['GITHUB_SHA']
assert base.startswith('https://') and re.fullmatch(r'[0-9a-f]{40}',sha)
def get(relative):
    with urllib.request.urlopen(urljoin(base,relative)+'?v='+sha,timeout=25) as response:
        if response.status!=200: raise RuntimeError('HTTP failure: '+relative)
        return response.read()
class Text(HTMLParser):
    def __init__(self): super().__init__();self.words=[]
    def handle_data(self,text): self.words.append(text)

manifest=json.loads(get('observations/enrichment.json'))
assert manifest['articles'], 'No enriched pages'
for entry in manifest['articles']:
    slug=entry['id']
    assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',slug)
    page=get(entry['path']).decode()
    for marker in ['data-expanded="true"','id="mechanism"','id="difference"','id="evidence"','id="experiment"','<table>']:
        assert marker in page,(slug,marker)
    parser=Text();parser.feed(page);text=''.join(parser.words)
    assert 'GPT 辅助整理' not in text and '修订记录' not in text
    assert page.count('class="step-label"')>=3
for fig in manifest['figures']:
    assert re.fullmatch(r'observations/assets/[a-z0-9-]+\.(?:png|jpg|gif)',fig['path'])
    assert hashlib.sha256(get(fig['path'])).hexdigest()==fig['sha256']
home=get('').decode()
assert '<h1>技术观察</h1>' in home
assert 'location.replace(articleURL(id))' in home and 'dialog.showModal' not in home
result={'status':'verified','commit':sha,'enriched_articles':len(manifest['articles']),'source_images':len(manifest['figures']),'image_warnings':manifest['image_warnings']}
print(json.dumps(result,ensure_ascii=False),flush=True)
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f: f.write('\n## Observation reader verification\n\n```json\n'+json.dumps(result,ensure_ascii=False,indent=2)+'\n```\n')
