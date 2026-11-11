"""Verify the public Pages release after deployment, without external services."""
import html
import json
import os
import re
import time
import urllib.request
from urllib.parse import urljoin, urlsplit

base = os.environ['SITE_URL'].rstrip('/') + '/'
expected = os.environ['GITHUB_SHA']
if urlsplit(base).scheme != 'https' or not re.fullmatch(r'[0-9a-f]{40}', expected):
    raise ValueError('Expected an HTTPS site and a full commit SHA')


def fetch(relative: str) -> str:
    url = urljoin(base, relative) + '?v=' + expected
    with urllib.request.urlopen(url, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError(f'{relative}: HTTP {response.status}')
        return response.read().decode('utf-8')


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
if 'data-reports-nav' not in home or 'href="reports/"' not in home:
    raise RuntimeError('Homepage report entry is missing')
listing = fetch('reports/')
if '<h1>深度报告</h1>' not in listing:
    raise RuntimeError('Report listing is missing')
metadata = json.loads(fetch('reports/index.json'))
reports = metadata.get('reports', [])
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
    if not fetch('reports/' + slug + '/report.md').startswith('# ' + report['title']):
        raise RuntimeError('Markdown export is missing: ' + slug)
    print('Verified report:', slug, flush=True)
for asset in ['reports/reports.css', 'reports/reports.js']:
    if not fetch(asset).strip():
        raise RuntimeError('Empty report asset: ' + asset)
result = {'status': 'verified', 'commit': expected, 'site': base,
          'report_count': len(reports), 'verified_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
print(json.dumps(result, ensure_ascii=False), flush=True)
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as stream:
        stream.write('## Public site verification\n\n```json\n' + json.dumps(result, ensure_ascii=False, indent=2) + '\n```\n')
