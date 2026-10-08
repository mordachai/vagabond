"""Extract Appendix C (Build Guides) from the Alpha 3 PDF into build-guides.json.

Usage: python -I scripts/build-guides/extract-from-pdf.py
Writes scripts/build-guides/build-guides.json (reviewed + committed; generate.mjs reads it).
"""
import json, re, sys
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / 'docs' / 'Vagabond - Core Rulebook v3 Alpha 3 [Interactive PDF].pdf'
OUT = Path(__file__).resolve().parent / 'build-guides.json'

STAT_KEYS = ['might', 'dexterity', 'awareness', 'reason', 'presence', 'luck']
LEVEL_RE = re.compile(r'^\d+(st|nd|rd|th)$')
NOISE = {'Appendices', 'd4', 'd6', 'd8', 'd10', 'd12'}

d = fitz.open(str(PDF))
start = next(i for i in range(len(d)) if 'Appendix C: BUILD GUIDES' in d[i].get_text())
lines = []
i = start
while True:
    t = d[i].get_text()
    if i > start and 'Appendix D' in t[:80]:
        break
    for ln in t.split('\n'):
        ln = ln.strip()
        if not ln or ln in NOISE or ln.startswith('Generated for') or ln.startswith('Appendix C: Build Guides //'):
            continue
        if re.fullmatch(r'\d{3}', ln):  # printed page numbers
            continue
        lines.append(ln)
    i += 1
    if i >= len(d):
        break

# Drop the intro paragraph (everything before the first guide title)
guides, cur = [], None
k = 0
while k < len(lines):
    ln = lines[k]
    nxt = lines[k + 1] if k + 1 < len(lines) else None
    # Titles are printed twice in a row ("Barbarian","Barbarian")
    if nxt == ln and k + 2 < len(lines) and lines[k + 2] == 'STATS':
        cur = {'title': ln, 'lines': []}
        guides.append(cur)
        k += 2
        continue
    if cur is not None:
        cur['lines'].append(ln)
    k += 1

def parse(g):
    L = g['lines']
    out = {'title': g['title']}
    idx = L.index('PERKS')
    head, perks = L[:idx], L[idx:]
    # stats: 6 header cells then rows of (level + 6 numbers)
    h = head.index('LUK') + 1
    rest = head[h:]
    rows = {}
    p = 0
    while p < len(rest) and LEVEL_RE.match(rest[p]):
        lvl = int(re.match(r'\d+', rest[p]).group())
        vals = [int(x) for x in rest[p + 1:p + 7]]
        rows[lvl] = dict(zip(STAT_KEYS, vals))
        p += 7
    out['stats'] = {str(k): v for k, v in rows.items()}
    text = ' '.join(rest[p:])
    m = re.match(r'Training:\s*(.*?)\s*Starting Pack:\s*(.*?)\s*Weapon:\s*(.*?)\s*Armor:\s*(.*?)\s*Spells:\s*(.*)$', text)
    if not m:
        raise SystemExit(f'cannot parse text block of {g["title"]}: {text!r}')
    out['training'] = [s.strip() for s in m.group(1).split(',') if s.strip()]
    out['startingPack'] = m.group(2).strip()
    out['weapon'] = m.group(3).strip()
    out['armor'] = m.group(4).strip()
    out['spells'] = m.group(5).strip()
    # perks: skip 'PERKS','Level Perk','Page' / 'Level','Perk','Page'
    pl = perks[1:]
    while pl and pl[0] in ('Level Perk', 'Level', 'Perk', 'Page'):
        pl.pop(0)
    groups, c = [], None
    for ln in pl:
        if LEVEL_RE.match(ln):
            c = {'level': int(re.match(r'\d+', ln).group()), 'raw': []}
            groups.append(c)
        elif c is not None:
            c['raw'].append(ln)
    plist = []
    for grp in groups:
        raw = ' '.join(grp['raw'])
        pm = re.search(r'\bp\. \d+', raw)
        names = raw[:pm.start()] if pm else raw
        names = [n.strip() for n in names.split(',') if n.strip()]
        plist.append({'level': grp['level'], 'perks': names})
    out['perks'] = plist
    return out

res = [parse(g) for g in guides]
OUT.write_text(json.dumps(res, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
print(f'{len(res)} guides -> {OUT}')
for r in res:
    print(' ', r['title'], '|', r['startingPack'], '|', r['weapon'], '|', r['armor'], '|', r['spells'][:40])
