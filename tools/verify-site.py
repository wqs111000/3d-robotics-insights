"""Verify published Pages content and attributed image bytes over public HTTPS."""
import hashlib
import html
import json
import os
import re
import time
import urllib.request
from urllib.parse import urljoin, urlsplit
from illustrate import image_info

base = os.environ['SITE_URL'].rstrip('/') + '/'
expected = os.environ['GITHUB_SHA']
if urlsplit(base).scheme != 'https' or not re.fullmatch(r'[0-9a-f]{40}', expected):
    raise ValueError('Expected an HTTPS site and a full commit SHA')


def fetch_bytes(relative):
    url = urljoin(base, relative) + '?v=' + expected
    with urllib.request.urlopen(url, timeout=25) as response:
        if response.status != 200:
            raise RuntimeError(f'{relative}: HTTP {response.status}')
        return response.read()


def fetch(relative):
    return fetch_bytes(relative).decode('utf-8')


for attempt in range(12):
    try:
        marker = json.loads(fetch('build-info.json'))
        if marker.get('commit') != expected:
            raise RuntimeError('CDN still returns an earlier build')
        break
    except Exception as exc:
        if attempt == 11:
            raise RuntimeError('Published build could not be verified') from exc
        print(f'Build marker not ready ({attempt + 1}/12): {exc}', flush=True)
        time.sleep(5)

home = fetch('')
if '<h1>技术观察</h1>' not in home:
    raise RuntimeError('Homepage observation heading is missing')

with open('content/articles.json', 'r', encoding='utf-8') as stream:
    observation_data = json.load(stream)
for item in observation_data['items']:
    if item.get('publish_approved') is not True:
        raise RuntimeError('Unapproved observation in public build')
    page = fetch('observations/' + item['id'] + '/')
    if '<h1>' + html.escape(item['title']) + '</h1>' not in page:
        raise RuntimeError('Observation title missing: ' + item['id'])
    if '<figure class="mechanism"' not in page:
        raise RuntimeError('Observation mechanism diagram missing: ' + item['id'])
print('Verified independent observation articles:', len(observation_data['items']), flush=True)

if 'data-reports-nav' not in home or 'href="reports/"' not in home:
    raise RuntimeError('Homepage report entry is missing')
if '<h1>深度报告</h1>' not in fetch('reports/'):
    raise RuntimeError('Report listing is missing')
metadata = json.loads(fetch('reports/index.json'))
reports = metadata.get('reports', [])
figures = json.loads(fetch('reports/figures.json'))['figures']
for report in reports:
    slug = report['slug']
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug):
        raise RuntimeError('Invalid report slug')
    if report.get('publish_approved') is not True:
        raise RuntimeError('Unapproved metadata is public')
    page = fetch('reports/' + slug + '/')
    if '<h1>' + html.escape(report['title']) + '</h1>' not in page:
        raise RuntimeError('Unexpected report page: ' + slug)
    ids = set(re.findall(r'\bid="([^"]+)"', page))
    if not all(target in ids for target in re.findall(r'href="#([^"]+)"', page)):
        raise RuntimeError('Broken in-page reference in ' + slug)
    markdown = fetch('reports/' + slug + '/report.md')
    if not markdown.startswith('# ' + report['title']):
        raise RuntimeError('Markdown export is missing: ' + slug)
    own = [f for f in figures if f['report_slug'] == slug]
    if len(own) != report.get('figure_count', 0):
        raise RuntimeError('Figure count mismatch: ' + slug)
    for figure in own:
        asset = figure['path']
        if not re.fullmatch(r'reports/assets/[a-z0-9-]+\.(?:png|jpg|gif)', asset):
            raise RuntimeError('Unexpected figure asset path')
        if 'data-report-figure="' + figure['id'] + '"' not in page:
            raise RuntimeError('Figure absent from article')
        data = fetch_bytes(asset)
        if hashlib.sha256(data).hexdigest() != figure['sha256']:
            raise RuntimeError('Published image checksum mismatch: ' + asset)
        _, width, height = image_info(data)
        if [width, height] != [figure['width'], figure['height']]:
            raise RuntimeError('Published image dimensions mismatch')
        if urljoin(base, asset) not in markdown:
            raise RuntimeError('Illustrated Markdown image absent')
    print('Verified report:', slug, 'figures:', len(own), flush=True)
for asset in ['reports/reports.css', 'reports/reports.js']:
    if not fetch(asset).strip():
        raise RuntimeError('Empty report asset: ' + asset)
result = {'status': 'verified', 'commit': expected, 'site': base,
          'report_count': len(reports), 'observation_count': len(observation_data['items']), 'figure_count': len(figures),
          'verified_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
print(json.dumps(result, ensure_ascii=False), flush=True)
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as stream:
        stream.write('## Public site verification\n\n```json\n' + json.dumps(result, ensure_ascii=False, indent=2) + '\n```\n')
