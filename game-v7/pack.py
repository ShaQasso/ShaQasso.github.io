"""Pack dist/ into one self-contained HTML page (play/mbiota.html) for the artifact viewer / quick sharing."""
import glob, os, re
d = 'dist/'
html = open(d + 'index.html').read()
js = open(glob.glob(d + 'assets/*.js')[0]).read()
css = open(glob.glob(d + 'assets/*.css')[0]).read()
assert '</script' not in js
start = html.index('<div id="app">')
end = html.index('</body>')
app = re.sub(r'<script[^>]*>.*?</script>', '', html[start:end], flags=re.S)
page = f'''<title>MBIOTA Remission</title>
<style>
:root {{ color-scheme: dark; }}
{css}
html, body {{ padding: 0; }}
</style>
{app}
<script type="module">
{js}
</script>
'''
os.makedirs('play', exist_ok=True)
open('play/mbiota.html', 'w').write(page)
print('wrote play/mbiota.html', len(page))
