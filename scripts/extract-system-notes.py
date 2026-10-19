"""Refresh searchable, paragraph-numbered extracts of the retained Word sources."""
from hashlib import sha256
from pathlib import Path
import json
import xml.etree.ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'docs' / 'system-sources'
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

for filename, prefix in [('main-notes.docx', 'P'), ('reordering-openers-rebid.docx', 'R')]:
    with ZipFile(SOURCES / filename) as package:
        body = ET.fromstring(package.read('word/document.xml'))
        paragraphs = body.findall('w:body/w:p', NS)
        lines = []
        for index, paragraph in enumerate(paragraphs, 1):
            content = ''.join(element.text or '' for element in paragraph.findall('.//w:t', NS)).rstrip()
            if content.strip():
                lines.append(f'{prefix}{index:04d} {content}')
        (SOURCES / filename.replace('.docx', '.txt')).write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')

manifest = {'files': [{
    'file': path.name, 'bytes': path.stat().st_size,
    'sha256': sha256(path.read_bytes()).hexdigest(),
} for path in sorted(SOURCES.iterdir()) if path.suffix in {'.docx', '.txt'} or path.name == 'july-relay-email.md']}
(SOURCES / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
print(f'Refreshed two Word extracts and {len(manifest["files"])} source hashes in {SOURCES}')
