"""Build attributed research figures as same-origin static report assets.

Only explicitly curated HTTPS hosts may be fetched. Invalid or unavailable images
fail the build instead of publishing broken illustrations. Complete attribution
and audit notes remain in the manifest; reader-facing credits are compact.
"""
import hashlib
import html
import json
import re
import struct
import time
import urllib.request
from pathlib import Path
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parent.parent
HOSTS = {'ovmm.github.io', 'concept-graphs.github.io', 'umi-on-legs.github.io',
         'ok-robot.github.io', 'vlmaps.github.io', 'pku-epic.github.io',
         'streamvln.github.io', 'internrobotics.github.io'}
LIMIT = 16 * 1024 * 1024
CSS = '''
.research-figure{margin:30px 0;padding:14px;background:#fff;border:1px solid var(--line);border-radius:8px;min-width:0;break-inside:avoid}
.research-figure .figure-image{display:block;background:#fff;line-height:0;text-decoration:none;border-radius:4px;overflow:hidden}
.research-figure img{display:block;width:100%;max-width:100%;height:auto;background:#fff;object-fit:contain}
.research-figure figcaption{font-size:13px;line-height:1.85;color:#52675b;padding-top:13px;overflow-wrap:anywhere}
.research-figure figcaption strong{display:block;color:var(--ink);font-size:14px;margin-bottom:5px}
.research-figure .figure-credit{display:block;font-size:11px;color:var(--muted);margin-top:8px}
@media(max-width:600px){.research-figure{padding:9px;margin:24px 0}.research-figure figcaption{font-size:12px}.research-figure figcaption strong{font-size:13px}}
@media print{.research-figure{padding:8px;border-color:#ddd;break-inside:avoid}.research-figure img{max-height:170mm;object-fit:contain}}
'''


def https_url(url, allowed=None):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('An absolute HTTPS URL without credentials is required')
    if allowed is not None and parsed.hostname not in allowed:
        raise ValueError('Image host is not in the curated allowlist')
    return url


def image_info(data):
    if data.startswith(b'\x89PNG\r\n\x1a\n') and len(data) >= 24:
        width, height = struct.unpack('>II', data[16:24])
        kind = 'png'
    elif data[:6] in (b'GIF87a', b'GIF89a') and len(data) >= 10:
        width, height = struct.unpack('<HH', data[6:10])
        kind = 'gif'
    elif data.startswith(b'\xff\xd8'):
        i = 2
        while i + 4 <= len(data):
            if data[i] != 255:
                i += 1
                continue
            while i < len(data) and data[i] == 255:
                i += 1
            if i >= len(data):
                break
            marker = data[i]
            i += 1
            if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                continue
            if i + 2 > len(data):
                break
            length = int.from_bytes(data[i:i+2], 'big')
            if length < 2 or i + length > len(data):
                break
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                height, width = struct.unpack('>HH', data[i+3:i+7])
                kind = 'jpg'
                break
            i += length
        if 'kind' not in locals():
            raise ValueError('Malformed JPEG')
    else:
        raise ValueError('Downloaded file is not a supported raster image')
    if not (1 <= width <= 30000 and 1 <= height <= 30000):
        raise ValueError('Unreasonable image dimensions')
    return kind, width, height


def fetch_image(url):
    https_url(url, HOSTS)
    last = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; Insights-Research-Figures/1.0)'})
            with urllib.request.urlopen(request, timeout=25) as response:
                https_url(response.geturl(), HOSTS)
                if response.status != 200:
                    raise RuntimeError('Unexpected HTTP response')
                data = response.read(LIMIT + 1)
            if not data or len(data) > LIMIT:
                raise ValueError('Image is empty or exceeds the size limit')
            image_info(data)
            return data
        except Exception as exc:
            last = exc
            if attempt < 2:
                time.sleep(1 + attempt)
    raise RuntimeError('Cannot obtain research figure: ' + url) from last


def insert_in_section(page, anchor, addition):
    heading = re.search(r'<h2\b[^>]*\bid="' + re.escape(anchor) + r'"[^>]*>.*?</h2>', page, re.S)
    if not heading:
        raise ValueError('Missing section: ' + anchor)
    following = re.search(r'<h2\b', page[heading.end():])
    if not following:
        raise ValueError('Figure must be in a body section before the references')
    pos = heading.end() + following.start()
    return page[:pos] + addition + page[pos:]


def credit_label(fig):
    """Keep project attribution short; full author credit is also in the link title."""
    return fig.get('credit_short') or fig['credit'].rsplit(' · ', 1)[-1]


def license_label(url):
    parsed = urlsplit(https_url(url))
    if parsed.hostname == 'creativecommons.org':
        match = re.fullmatch(r'/licenses/([a-z-]+)/([0-9.]+)/?', parsed.path)
        if match:
            return 'CC ' + match[1].upper() + ' ' + match[2]
    return '许可'


def figure_html(fig, number, filename, width, height):
    e = html.escape
    image = '../assets/' + filename
    credit = (f'<a href="{e(https_url(fig["source_page"]))}" title="{e(fig["credit"])}" '
              f'aria-label="{e(fig["credit"])}" target="_blank" rel="noopener noreferrer">{e(credit_label(fig))}</a>')
    if fig.get('license_url'):
        credit += (f' · <a href="{e(https_url(fig["license_url"]))}" target="_blank" '
                   f'rel="noopener noreferrer">{e(license_label(fig["license_url"]))}</a>')
    return (f'<figure class="research-figure" id="fig-{e(fig["id"])}" data-report-figure="{e(fig["id"])}">'
            f'<a class="figure-image" href="{image}" target="_blank" rel="noopener" title="点击放大" aria-label="查看大图：{e(fig["title"])}">'
            f'<img src="{image}" alt="{e(fig["alt"])}" width="{width}" height="{height}" loading="lazy" decoding="async"></a>'
            f'<figcaption><strong>图 {number} · {e(fig["title"])}</strong>{e(fig["caption"])}'
            f'<span class="figure-credit">来源：{credit}</span></figcaption></figure>\n')


def build_figures(root=ROOT, downloader=fetch_image):
    root = Path(root)
    manifest = json.loads((root / 'content/reports/figures.json').read_text())
    published = json.loads((root / 'dist/reports/index.json').read_text())['reports']
    public = json.loads((root / 'content/articles.json').read_text())['site']['public_url'].rstrip('/') + '/'
    https_url(public)
    figures_by_report = manifest['reports']
    assets = root / 'dist/reports/assets'
    assets.mkdir(parents=True, exist_ok=True)
    output, used = [], set()
    for report in published:
        slug = report['slug']
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug):
            raise ValueError('Invalid slug')
        figures = figures_by_report.get(slug, [])
        page_path = root / 'dist/reports' / slug / 'index.html'
        md_path = root / 'dist/reports' / slug / 'report.md'
        page, markdown = page_path.read_text(), md_path.read_text()
        for number, fig in enumerate(figures, 1):
            fid = fig['id']
            if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', fid) or fid in used:
                raise ValueError('Duplicate or invalid figure ID')
            used.add(fid)
            for key in ('alt', 'title', 'caption', 'credit', 'rights_note', 'checked_on'):
                if not fig.get(key):
                    raise ValueError('Missing figure field: ' + key)
            https_url(fig['source_url'], HOSTS)
            https_url(fig['source_page'])
            data = downloader(fig['source_url'])
            kind, width, height = image_info(data)
            filename = fid + '.' + kind
            (assets / filename).write_bytes(data)
            page = insert_in_section(page, fig['section'], figure_html(fig, number, filename, width, height))
            picture_url = urljoin(public, 'reports/assets/' + filename)
            credit = f'来源：[{credit_label(fig)}]({fig["source_page"]})'
            if fig.get('license_url'):
                credit += f' · [{license_label(fig["license_url"])}]({fig["license_url"]})'
            block = (f'\n![{fig["alt"]}]({picture_url})\n\n'
                     f'**图 {number} · {fig["title"]}。** {fig["caption"]}\n\n{credit}\n\n')
            section = re.search(r'(?m)^## .+\{#' + re.escape(fig['section']) + r'\}\s*$', markdown)
            if not section:
                raise ValueError('Markdown section does not match figure')
            next_heading = re.search(r'(?m)^## ', markdown[section.end():])
            if not next_heading:
                raise ValueError('Missing next Markdown section')
            pos = section.end() + next_heading.start()
            markdown = markdown[:pos] + block + markdown[pos:]
            output.append({**fig, 'report_slug': slug, 'path': 'reports/assets/' + filename,
                           'width': width, 'height': height, 'bytes': len(data),
                           'sha256': hashlib.sha256(data).hexdigest()})
            print(f'Figure ready: {slug}/{fid} ({width}x{height}, {len(data)} bytes)', flush=True)
        page_path.write_text(page)
        md_path.write_text(markdown)
    with (root / 'dist/reports/reports.css').open('a') as stream:
        stream.write(CSS)
    (root / 'dist/reports/figures.json').write_text(json.dumps({'schema_version': 1, 'figures': output}, ensure_ascii=False, indent=2) + '\n')
    print('Built', len(output), 'attributed figures for', len(published), 'reports', flush=True)
    return output


if __name__ == '__main__':
    build_figures()
