"""Regression checks for content-first report pages (no network or dependencies)."""
import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FORBIDDEN = ('修订记录', 'GPT 辅助整理', '公开授权不等于本人审阅或实测',
             '报告按需更新，不随周刊重复编号')


class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = max(0, self.skip - 1)

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def visible_text(markup):
    parser = Text()
    parser.feed(markup)
    return ''.join(parser.parts)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def check_report(page, markdown, report, figures):
    text = visible_text(page)
    slug = report['slug']
    for phrase in FORBIDDEN:
        require(phrase not in text, f'{slug}: production note still displayed: {phrase}')
    if report.get('provenance_note'):
        require(report['provenance_note'] not in text, f'{slug}: provenance displayed')
    for change in report.get('changelog', []):
        require(change['note'] not in text, f'{slug}: internal changelog displayed')
    require('资料截止 ' + report['research_as_of'] in text, f'{slug}: research date lost')
    require('参考资料' in text, f'{slug}: references lost')
    metadata = re.search(r'<div class="metadata">(.*?)</div>', page, re.S)
    require(metadata is not None and '修订' not in visible_text(metadata[1]), f'{slug}: revision badge remains')
    require(metadata is not None and not re.search(r'\bv\d+\.\d+', visible_text(metadata[1])), f'{slug}: version badge remains')
    intro = markdown.split('## ', 1)[0]
    require('版本：' not in intro and 'GPT 辅助整理' not in intro, f'{slug}: noisy Markdown introduction')
    for fig in figures:
        match = re.search(r'<figure\b[^>]*data-report-figure="' + re.escape(fig['id']) + r'"[^>]*>(.*?)</figure>', page, re.S)
        require(match is not None, f'{slug}: figure missing: {fig["id"]}')
        body = match[1]
        require(fig['caption'] in visible_text(body), f'{slug}: technical caption changed')
        credit = re.search(r'<span class="figure-credit">(.*?)</span>', body, re.S)
        require(credit is not None, f'{slug}: source attribution missing')
        credit_text = visible_text(credit[1])
        require(credit_text.startswith('来源：'), f'{slug}: inconsistent credit format')
        for phrase in ('来源核查', '中文图解', '图像未修改', '本站实测', '网页模板许可'):
            require(phrase not in credit_text, f'{slug}: verbose credit: {phrase}')
        require('figure-hint' not in body, f'{slug}: repeated image hint')
        require(fig['source_page'] in html.unescape(credit[1]), f'{slug}: original source link lost')
        require(html.escape(fig['credit']) in credit[1], f'{slug}: full attribution lost')
        if fig.get('license_url'):
            require(fig['license_url'] in html.unescape(credit[1]), f'{slug}: license link lost')
        require('loading="lazy"' in body and 'alt="' in body, f'{slug}: image accessibility lost')
    return len(figures)


def main(root=ROOT):
    root = Path(root)
    reports = json.loads((root / 'dist/reports/index.json').read_text())['reports']
    source = json.loads((root / 'content/reports/index.json').read_text())['reports']
    source = {r['slug']: r for r in source if r['publish_approved']}
    figures = json.loads((root / 'dist/reports/figures.json').read_text())['figures']
    listing = visible_text((root / 'dist/reports/index.html').read_text())
    for phrase in FORBIDDEN:
        require(phrase not in listing, 'Listing contains production notes')
    total = 0
    for report in reports:
        slug = report['slug']
        # Hiding bookkeeping must not discard or falsify the source metadata.
        require(report == source[slug], f'{slug}: source metadata unexpectedly changed')
        own = [f for f in figures if f['report_slug'] == slug]
        folder = root / 'dist/reports' / slug
        total += check_report((folder / 'index.html').read_text(), (folder / 'report.md').read_text(), report, own)
        print(f'PASS clean presentation: {slug}; {len(own)} source/credit links preserved')
    print(f'Presentation checks passed: {len(reports)} reports, {total} figures')


if __name__ == '__main__':
    main()
