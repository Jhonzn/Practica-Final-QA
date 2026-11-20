"""Inserta en la plantilla del informe las secciones 10 y 11.2-11.3 escritas en Markdown.

Uso: python md2docx.py <docx_desempaquetado> <seccion10.md> <seccion11.md> <raiz_repo>

Subconjunto de Markdown soportado:
  '# '  -> Ttulo1, '## ' -> Ttulo2, '### ' -> párrafo en negrita
  párrafos, '- ' viñetas (Listaconvietas), tablas con '|', **negrita**, `código`
  ![EVI-XX. Pie de figura](ruta/relativa/al/repo.png) -> imagen centrada + pie (Descripcin)
"""
import os
import re
import struct
import sys
from xml.sax.saxutils import escape

DOCX, MD10, MD11, REPO = sys.argv[1:5]
DOC = os.path.join(DOCX, 'word', 'document.xml')
RELS = os.path.join(DOCX, 'word', '_rels', 'document.xml.rels')
MEDIA = os.path.join(DOCX, 'word', 'media')

TEXT_WIDTH = 9936  # dxa, mismo ancho de las tablas de la plantilla
MAX_IMG_W = 5760720  # EMU (16 cm), igual que las figuras de la sección 7
MAX_IMG_H = 6480000  # 18 cm
LANG = '<w:lang w:val="es-CO"/>'

rels = open(RELS, encoding='utf-8').read()
next_rid = [max(int(x) for x in re.findall(r'Id="rId(\d+)"', rels)) + 100]
next_docpr = [9500]
new_rels = []


def png_size(path):
    with open(path, 'rb') as f:
        head = f.read(24)
    w, h = struct.unpack('>II', head[16:24])
    return w, h


ID_RE = re.compile(r'\b(?:SEC|VUL|ZAP|EVI|CWE|DEF)-[A-Za-z0-9-]+')
NBH = '‑'


def t(s):
    """<w:t> con guiones no separables dentro de identificadores (SEC-A01-01, VUL-01...)."""
    s = ID_RE.sub(lambda m: m.group(0).replace('-', NBH), s)
    parts = escape(s).split(NBH)
    return '<w:noBreakHyphen/>'.join(f'<w:t xml:space="preserve">{p}</w:t>' for p in parts)


def runs(text, base_rpr='', size=None):
    """Convierte **negrita** y `código` en runs."""
    out = []
    sz = f'<w:sz w:val="{size}"/>' if size else ''
    for part in re.split(r'(\*\*[^*]+\*\*|`[^`]+`|(?<![\w*])\*[^*\s][^*]*\*(?![\w*]))', text):
        if not part:
            continue
        rpr = base_rpr
        if part.startswith('**') and part.endswith('**'):
            part = part[2:-2]
            rpr += '<w:b/>'
        elif part.startswith('*') and part.endswith('*') and len(part) > 2:
            part = part[1:-1]
            rpr += '<w:i/>'
        elif part.startswith('`') and part.endswith('`'):
            part = part[1:-1]
            rpr += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>'
            if not size:
                sz_local = '<w:sz w:val="18"/>'
                out.append(f'<w:r><w:rPr>{rpr}{sz_local}{LANG}</w:rPr>{t(part)}</w:r>')
                continue
        out.append(f'<w:r><w:rPr>{rpr}{sz}{LANG}</w:rPr>{t(part)}</w:r>')
    return ''.join(out)


def para(text, style=None, extra_ppr=''):
    ps = f'<w:pStyle w:val="{style}"/>' if style else ''
    return f'<w:p><w:pPr>{ps}{extra_ppr}<w:rPr>{LANG}</w:rPr></w:pPr>{runs(text)}</w:p>'


def image(caption, rel_path):
    src = os.path.join(REPO, rel_path)
    if not os.path.exists(src):
        raise FileNotFoundError(src)
    name = 'sec-' + os.path.basename(rel_path).lower()
    with open(src, 'rb') as f, open(os.path.join(MEDIA, name), 'wb') as g:
        g.write(f.read())
    rid = f'rId{next_rid[0]}'
    next_rid[0] += 1
    new_rels.append(f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{name}"/>')
    w, h = png_size(src)
    cx = MAX_IMG_W
    cy = int(cx * h / w)
    if cy > MAX_IMG_H:
        cy = MAX_IMG_H
        cx = int(cy * w / h)
    did = next_docpr[0]
    next_docpr[0] += 1
    drawing = (
        f'<w:p><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="60"/><w:jc w:val="center"/></w:pPr>'
        f'<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
        f'<wp:extent cx="{cx}" cy="{cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
        f'<wp:docPr id="{did}" name="Imagen {did}" descr="{escape(name)}"/>'
        f'<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
        f'<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        f'<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="{did}" name="{escape(name)}"/><pic:cNvPicPr/></pic:nvPicPr>'
        f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
        f'<a:ln w="6350"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:ln></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    )
    cap = f'<w:p><w:pPr><w:pStyle w:val="Descripcin"/><w:jc w:val="center"/><w:rPr>{LANG}</w:rPr></w:pPr>{runs(caption)}</w:p>'
    return drawing + cap


def table(rows):
    header, body = rows[0], rows[1:]
    ncol = len(header)
    # Ancho proporcional a la longitud del texto, con mínimo por columna
    lens = [max(min(len(r[i]) if i < len(r) else 0, 160) for r in rows) for i in range(ncol)]
    # La palabra más larga de cada columna no debe partirse (p. ej. "SEC-A01-01")
    words = [max((len(w) for r in rows if i < len(r) for w in re.sub(r'[`*]', '', r[i]).split()), default=0) for i in range(ncol)]
    lens = [max(l, 10, int(words[i] * 2.2)) for i, l in enumerate(lens)]
    tot = sum(lens)
    widths = [int(TEXT_WIDTH * l / tot) for l in lens]
    widths[-1] += TEXT_WIDTH - sum(widths)
    grid = ''.join(f'<w:gridCol w:w="{w}"/>' for w in widths)

    def cell(text, w, head):
        shd = '<w:shd w:val="clear" w:color="auto" w:fill="1F4E79"/>' if head else ''
        base = '<w:b/><w:color w:val="FFFFFF"/>' if head else ''
        return (f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>{shd}<w:vAlign w:val="center"/></w:tcPr>'
                f'<w:p><w:pPr><w:spacing w:before="20" w:after="20"/><w:jc w:val="left"/></w:pPr>{runs(text, base, 17)}</w:p></w:tc>')

    def row(cells, head=False):
        cells = cells + [''] * (ncol - len(cells))
        trpr = '<w:trPr><w:tblHeader/><w:jc w:val="center"/></w:trPr>' if head else '<w:trPr><w:cantSplit/><w:jc w:val="center"/></w:trPr>'
        return f'<w:tr>{trpr}' + ''.join(cell(c, widths[i], head) for i, c in enumerate(cells)) + '</w:tr>'

    return ('<w:tbl><w:tblPr><w:tblStyle w:val="Tablaconcuadrcula"/><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/>'
            '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>'
            f'<w:tblGrid>{grid}</w:tblGrid>' + row(header, True) + ''.join(row(r) for r in body) + '</w:tbl>'
            + '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:rPr>' + LANG + '</w:rPr></w:pPr></w:p>')


def convert(md):
    out = []
    lines = md.splitlines()
    i = 0
    while i < len(lines):
        ln = lines[i].rstrip()
        if not ln.strip() or ln.startswith('<!--'):
            i += 1
            continue
        if ln.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-{2,}:?', c) for c in cells):
                    rows.append(cells)
                i += 1
            out.append(table(rows))
            continue
        m = re.fullmatch(r'!\[(.+)\]\((.+)\)', ln.strip())
        if m:
            out.append(image(m.group(1), m.group(2)))
        elif ln.startswith('# '):
            out.append(para(ln[2:], 'Ttulo1'))
        elif ln.startswith('## '):
            out.append(para(ln[3:], 'Ttulo2'))
        elif ln.startswith('### '):
            out.append(para(f'**{ln[4:]}**', None, '<w:keepNext/><w:spacing w:before="160" w:after="60"/>'))
        elif ln.startswith('- '):
            out.append(para(ln[2:], 'Listaconvietas'))
        else:
            out.append(para(ln.strip(), None, '<w:jc w:val="both"/>'))
        i += 1
    return ''.join(out)


def block_start(xml, text):
    """Inicio del elemento de cuerpo (<w:p> o <w:tbl>) que contiene 'text'."""
    i = xml.find(text)
    if i < 0:
        raise ValueError(f'No se encontró: {text}')
    return max(xml.rfind('<w:p ', 0, i), xml.rfind('<w:p>', 0, i))


xml = open(DOC, encoding='utf-8').read()

# Sección 10 completa: desde su Título 1 hasta el Título 1 de la sección 11
s10 = block_start(xml, '10. Pruebas de seguridad')
s11 = block_start(xml, '11. Métricas de calidad')
xml = xml[:s10] + convert(open(MD10, encoding='utf-8').read()) + xml[s11:]

# Sección 11: se reemplaza desde el Título 2 "11.2" hasta el Título 2 "11.4" (11.1 y 11.4 son de la Persona 4)
a = block_start(xml, '11.2 Resultados de SonarQube')
b = block_start(xml, '11.4 Evaluación general')
xml = xml[:a] + convert(open(MD11, encoding='utf-8').read()) + xml[b:]

open(DOC, 'w', encoding='utf-8').write(xml)
rels = rels.replace('</Relationships>', ''.join(new_rels) + '</Relationships>')
open(RELS, 'w', encoding='utf-8').write(rels)
print(f'Insertadas {len(new_rels)} imágenes')
