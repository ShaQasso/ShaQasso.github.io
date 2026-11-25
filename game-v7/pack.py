"""Pack dist/ into one self-contained HTML page (play/mbiota.html) for the artifact viewer / quick sharing."""
import glob, os, re
d = 'dist/'
html = open(d + 'index.html', encoding='utf-8').read()
js = open(glob.glob(d + 'assets/*.js')[0], encoding='utf-8').read()
css = open(glob.glob(d + 'assets/*.css')[0], encoding='utf-8').read()
assert '</script' not in js
start = html.index('<div id="app">')
end = html.index('</body>')
app = re.sub(r'<script[^>]*>.*?</script>', '', html[start:end], flags=re.S)
# keep the real <head> (charset, viewport for phones, title, icon, fonts), minus the asset links that get inlined
head = html[html.index('<head>') + 6:html.index('</head>')]
head = re.sub(r'\s*<script[^>]*src="\./assets/[^"]*"[^>]*></script>', '', head)
head = re.sub(r'\s*<link rel="stylesheet"[^>]*href="\./assets/[^"]*"[^>]*>', '', head)
assert 'charset' in head and 'viewport' in head and './assets/' not in head
page = f'''<!doctype html>
<html lang="en">
<head>{head}
<style>
:root {{ color-scheme: dark; }}
{css}
html, body {{ padding: 0; }}
</style>
</head>
<body>
{app}
<script type="module">
{js}
</script>
</body>
</html>
'''
os.makedirs('play', exist_ok=True)
open('play/mbiota.html', 'w', encoding='utf-8').write(page)
print('wrote play/mbiota.html', len(page))
