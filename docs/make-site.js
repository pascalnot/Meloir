// Builds the website pages in docs/ from PRIVACY.md, so the two never drift apart.
// Run with: node docs/make-site.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = text => escape(text)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

// Only what PRIVACY.md uses: headings, paragraphs, lists and one table.
const toHtml = markdown => {
  const out = [];
  const blocks = markdown.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    if (/^# /.test(block)) out.push('<h1>' + inline(block.slice(2)) + '</h1>');
    else if (/^## /.test(block)) out.push('<h2>' + inline(block.slice(3)) + '</h2>');
    else if (lines.every(line => line.startsWith('- '))) out.push('<ul>' + lines.map(line => '<li>' + inline(line.slice(2)) + '</li>').join('') + '</ul>');
    else if (lines[0].startsWith('|')) {
      const cells = line => line.split('|').slice(1, -1).map(cell => cell.trim());
      const head = cells(lines[0]), rows = lines.slice(2).map(cells);
      out.push('<div class="table"><table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>'
        + rows.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>');
    } else out.push('<p>' + inline(lines.join(' ')) + '</p>');
  }
  return out.join('\n');
};

const logo = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50" fill="#fff"/><path fill="#000" d="M26 27h11l13 22 13-22h11v46H63V46L50 68 37 46v27H26z"/></svg>';
const page = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(logo.replace('aria-hidden="true"', 'xmlns="http://www.w3.org/2000/svg"'))}">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #000; color: #fff; font: 16px/1.65 "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 56px 20px 96px; }
  header { display: flex; align-items: center; gap: 10px; margin-bottom: 48px; font-size: 12px; font-weight: 600; letter-spacing: .3em; }
  header a { color: inherit; text-decoration: none; display: flex; align-items: center; gap: 10px; }
  header svg { width: 22px; height: 22px; }
  h1 { font: 600 40px/1.1 "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; letter-spacing: -.02em; margin: 0 0 8px; }
  h2 { font-size: 13px; font-weight: 600; color: #8c8c8c; text-transform: uppercase; letter-spacing: .12em; margin: 48px 0 12px; }
  p, li { color: #d0d0d0; }
  em { color: #8c8c8c; font-style: normal; }
  strong { color: #fff; font-weight: 600; }
  a { color: #fff; text-underline-offset: 3px; text-decoration-color: #4d4d4d; }
  a:hover { text-decoration-color: #fff; }
  code { font: 14px Consolas, monospace; background: #111; padding: 2px 6px; border-radius: 4px; color: #fff; }
  ul { padding-left: 20px; }
  li { margin: 6px 0; }
  .table { overflow-x: auto; margin: 16px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th { text-align: left; color: #8c8c8c; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; padding: 10px 12px 10px 0; border-bottom: 1px solid #1a1a1a; }
  td { vertical-align: top; color: #d0d0d0; padding: 12px 12px 12px 0; border-bottom: 1px solid #1a1a1a; }
  footer { margin-top: 72px; color: #4d4d4d; font-size: 13px; }
  footer a { color: #8c8c8c; }
  .links { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
  .links a { padding: 10px 20px; border-radius: 999px; border: 1px solid #333; text-decoration: none; font-weight: 600; }
  .links a.main { background: #fff; color: #000; border-color: #fff; }
</style>
</head>
<body>
<main>
<header><a href="./">${logo}MELOIR</a></header>
${body}
<footer><a href="https://github.com/pascalnot/Meloir">Meloir on GitHub</a> · <a href="privacy.html">Privacy</a></footer>
</main>
</body>
</html>
`;

const privacy = fs.readFileSync(path.join(root, 'PRIVACY.md'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'privacy.html'), page('Meloir · Privacy', toHtml(privacy)));
fs.writeFileSync(path.join(__dirname, 'index.html'), page('Meloir', `<h1>Meloir</h1>
<p>A pure black interface for the Spotify desktop app on Windows. The only colour on screen comes from the covers.</p>
<div class="links"><a class="main" href="https://github.com/pascalnot/Meloir/releases/latest">Download</a><a href="https://github.com/pascalnot/Meloir">GitHub</a><a href="privacy.html">Privacy</a></div>`));
console.log('site built');
