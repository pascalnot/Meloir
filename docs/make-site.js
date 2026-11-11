// Builds privacy.html for the website (the gh-pages branch) from PRIVACY.md, in the site's own look,
// so the two never drift apart. Run with: node docs/make-site.js <folder of the gh-pages checkout>
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = process.argv[2];
if (!out) throw new Error('Give the folder of the gh-pages checkout');

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = text => escape(text)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

// Only what PRIVACY.md uses: headings, paragraphs, lists and one table. Each block rises in like the site's.
const toHtml = markdown => {
  const html = [];
  const blocks = markdown.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  let n = 0;
  for (const block of blocks) {
    const lines = block.split('\n');
    const rise = ` class="fade" style="--n:${Math.min(n++, 8)}"`;
    if (/^# /.test(block)) html.push(`<h1${rise}>` + inline(block.slice(2)) + '</h1>');
    else if (/^## /.test(block)) html.push(`<h2${rise}>` + inline(block.slice(3)) + '</h2>');
    else if (lines.every(line => line.startsWith('- '))) html.push(`<ul${rise}>` + lines.map(line => '<li>' + inline(line.slice(2)) + '</li>').join('') + '</ul>');
    else if (lines[0].startsWith('|')) {
      const cells = line => line.split('|').slice(1, -1).map(cell => cell.trim());
      const head = cells(lines[0]), rows = lines.slice(2).map(cells);
      html.push(`<div${rise.replace('fade', 'fade table')}><table><thead><tr>` + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>'
        + rows.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>');
    } else html.push(`<p${rise}>` + inline(lines.join(' ')) + '</p>');
  }
  return html.join('\n');
};

const page = body => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meloir · Privacy</title>
<meta name="description" content="What Meloir keeps on your PC and what it sends to other services.">
<link rel="icon" href="logo.svg" type="image/svg+xml">
<script>
  // The theme and motion chosen on the main page.
  (() => {
    const read = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };
    const root = document.documentElement;
    if (read('meloir.theme') === 'light') root.classList.add('light');
    const motion = read('meloir.motion');
    if (motion === 'off' || (motion === null && matchMedia('(prefers-reduced-motion: reduce)').matches)) root.classList.add('still');
  })();
</script>
<style>
  /* The same colours, type and timing as the main page. */
  :root { --ease:cubic-bezier(.2,.8,.2,1); --bg:#000; --fg:#fff; --mute:#8c8c8c; --faint:#4d4d4d; --line:#1a1a1a; --text:#d0d0d0; --font:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif; --display:"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif; color-scheme:dark; }
  :root.light { --bg:#fff; --fg:#000; --mute:#6b6b6b; --faint:#a3a3a3; --line:#ececec; --text:#333; color-scheme:light; }
  * { box-sizing:border-box; margin:0; padding:0; }
  html { background:var(--bg); }
  body { background:var(--bg); color:var(--fg); font:16px/1.65 var(--font); -webkit-font-smoothing:antialiased; }
  a { color:inherit; }
  a:focus-visible { outline:1px solid var(--fg); outline-offset:3px; }
  :root.still *, :root.still *::before, :root.still *::after { animation:none!important; transition:none!important; }
  header { position:fixed; left:0; right:0; top:0; z-index:20; height:52px; display:flex; align-items:center; padding:0 20px; }
  header::before { content:""; position:absolute; inset:0 0 -22px; z-index:-1; pointer-events:none; background:linear-gradient(to bottom,var(--bg) 40%,transparent); }
  .brand { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600; letter-spacing:.08em; text-decoration:none; }
  .brand svg { width:18px; height:18px; transition:transform .4s var(--ease); }
  .brand:hover svg { transform:rotate(-12deg) scale(1.12); }
  main { max-width:760px; margin:0 auto; padding:120px 28px 72px; }
  h1 { font:600 clamp(44px,8vw,72px)/1.05 var(--display); letter-spacing:-.035em; margin-bottom:10px; }
  h2 { font-size:13px; font-weight:600; color:var(--mute); margin:52px 0 14px; }
  p, li, td { color:var(--text); }
  p + p { margin-top:12px; }
  em { color:var(--mute); font-style:normal; }
  b { color:var(--fg); font-weight:600; }
  a { text-underline-offset:3px; text-decoration-color:var(--faint); transition:text-decoration-color .15s; }
  a:hover { text-decoration-color:var(--fg); }
  code { font:14px Consolas,monospace; color:var(--fg); }
  ul { list-style:none; }
  li { position:relative; padding-left:18px; margin:8px 0; }
  li::before { content:""; position:absolute; left:0; top:.72em; width:5px; height:5px; border-radius:50%; background:var(--faint); }
  .table { overflow-x:auto; margin-top:8px; }
  table { border-collapse:collapse; width:100%; font-size:14px; }
  th { text-align:left; color:var(--mute); font-weight:600; font-size:13px; padding:10px 16px 10px 0; border-bottom:1px solid var(--line); }
  td { vertical-align:top; padding:12px 16px 12px 0; border-bottom:1px solid var(--line); }
  @keyframes rise { from { opacity:0; transform:translateY(14px); } }
  .fade { animation:rise .7s var(--ease) backwards; animation-delay:calc(var(--n) * 60ms + .1s); }
  footer { color:var(--faint); font-size:13px; max-width:760px; margin:0 auto; padding:0 28px 52px; }
  footer a { color:var(--mute); }
</style>
</head>
<body>
<header><a class="brand" href="./"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50" fill="var(--fg)"/><path fill="var(--bg)" d="M26 27h11l13 22 13-22h11v46H63V46L50 68 37 46v27H26z"/></svg>Meloir</a></header>
<main>
${body}
</main>
<footer><p>Not affiliated with or endorsed by Spotify. Spotify is a trademark of Spotify AB. <a href="./">Back to Meloir</a></p></footer>
</body>
</html>
`;

const privacy = fs.readFileSync(path.join(root, 'PRIVACY.md'), 'utf8');
fs.writeFileSync(path.join(out, 'privacy.html'), page(toHtml(privacy)));
console.log('privacy.html written to ' + out);
