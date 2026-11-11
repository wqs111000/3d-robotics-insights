import hashlib
import json
import struct
import tempfile
import unittest
import zlib
from pathlib import Path
from illustrate import build_figures, https_url, image_info, insert_in_section


def png():
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress((b'\0' + b'\xff'*6)*2)) + chunk(b'IEND', b'')


class Figures(unittest.TestCase):
    def test_png_dimensions(self):
        self.assertEqual(image_info(png()), ('png', 2, 2))

    def test_html_is_not_an_image(self):
        with self.assertRaises(ValueError):
            image_info(b'<html>404</html>')

    def test_url_allowlist(self):
        for url in ['http://ovmm.github.io/x.png', 'https://127.0.0.1/x.png', 'https://u:p@ovmm.github.io/x.png']:
            with self.assertRaises(ValueError):
                https_url(url, {'ovmm.github.io'})

    def test_missing_anchor(self):
        with self.assertRaises(ValueError):
            insert_in_section('<h2 id="a">A</h2>', 'missing', 'FIG')

    def test_insertion_order(self):
        p = insert_in_section('<h2 id="a">A</h2><p>Body</p><h2 id="references">Refs</h2>', 'a', 'FIG')
        self.assertLess(p.index('Body'), p.index('FIG'))
        self.assertLess(p.index('FIG'), p.index('<h2 id="references"'))

    def test_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/'content/reports').mkdir(parents=True)
            (root/'dist/reports/demo').mkdir(parents=True)
            fig = dict(id='task', section='scope', title='Task', alt='A "quoted" task', caption='<script>not code</script>', credit='Authors', rights_note='Attribution', checked_on='2026-11-11', source_url='https://ovmm.github.io/static/images/the_task.png', source_page='https://ovmm.github.io/')
            (root/'content/reports/figures.json').write_text(json.dumps({'reports': {'demo': [fig]}}))
            (root/'content/articles.json').write_text(json.dumps({'site': {'public_url': 'https://example.org/site/'}}))
            (root/'dist/reports/index.json').write_text(json.dumps({'reports': [{'slug': 'demo'}]}))
            (root/'dist/reports/demo/index.html').write_text('<h2 id="scope">Scope</h2><p>Body</p><h2 id="references">Refs</h2>')
            (root/'dist/reports/demo/report.md').write_text('# Report\n\n## Scope {#scope}\n\nBody\n\n## References {#references}\n')
            result = build_figures(root, lambda url: png())
            page = (root/'dist/reports/demo/index.html').read_text()
            self.assertIn('src="../assets/task.png"', page)
            self.assertIn('alt="A &quot;quoted&quot; task"', page)
            self.assertNotIn('<script>', page)
            self.assertIn('&lt;script&gt;', page)
            self.assertEqual(result[0]['sha256'], hashlib.sha256(png()).hexdigest())
            self.assertIn('https://example.org/site/reports/assets/task.png', (root/'dist/reports/demo/report.md').read_text())
            self.assertEqual((root/'dist/reports/assets/task.png').read_bytes(), png())


if __name__ == '__main__':
    unittest.main()
