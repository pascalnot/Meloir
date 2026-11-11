// Builds privacy.html and changelog.html for the website (the gh-pages branch) from PRIVACY.md and
// CHANGELOG.md. The pages borrow the main page's own styles, header, side list, footer and script, so
// they look and move the same. Run with: node docs/make-site.js <folder of the gh-pages checkout>
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = process.argv[2];
if (!out) throw new Error('Give the folder of the gh-pages checkout');
const site = fs.readFileSync(path.join(out, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n').trim();

const between = (from, to, keepEnd = true) => {
  const a = site.indexOf(from), b = site.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('index.html changed: could not find ' + from);
  return site.slice(a, keepEnd ? b + to.length : b);
};

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = text => escape(text)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/\*([^*]+)\*/g, '$1')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
const idOf = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const block = text => {
  const lines = text.split('\n');
  if (/^### /.test(text)) return '<p class="eyebrow rv">' + escape(text.slice(4)) + '</p>';
  if (lines.every(line => line.startsWith('- '))) {
    return '<ul class="more">' + lines.map(line => '<li class="rv">' + inline(line.slice(2)) + '</li>').join('') + '</ul>';
  }
  if (lines[0].startsWith('|')) {
    const cells = line => line.split('|').slice(1, -1).map(cell => cell.trim());
    const head = cells(lines[0]), rows = lines.slice(2).map(cells);
    return '<div class="sheet rv"><table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>'
      + rows.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  }
  if (/^\*[^*].*\*$/.test(text)) return '<p class="small rv">' + escape(text.slice(1, -1)) + '</p>';
  return '<p class="note rv">' + inline(lines.join(' ')) + '</p>';
};

const extraCss = `
  /* Only for these pages: a shorter opening, group labels, and the table of services. */
  .hero.short { min-height:64svh; padding-bottom:24px; }
  .band .note + .more, .band .more + .note, .band .note + .sheet, .band .sheet + .note { margin-top:20px; }
  .band .more { margin-top:20px; }
  .band .small { margin-top:8px; }
  .band .eyebrow { margin-top:36px; }
  .band .eyebrow + .more { margin-top:8px; }
  .note code, .more code { font:14px Consolas,monospace; color:var(--fg); }
  .note a, .more a, .sheet a { text-underline-offset:3px; text-decoration-color:var(--faint); }
  .note a:hover, .more a:hover, .sheet a:hover { text-decoration-color:var(--fg); }
  .sheet { margin-top:24px; overflow-x:auto; }
  .sheet table { border-collapse:collapse; width:100%; font-size:15px; }
  .sheet th { text-align:left; color:var(--faint); font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; padding:0 20px 12px 0; border-bottom:1px solid var(--line); }
  .sheet td { vertical-align:top; color:var(--mute); padding:14px 20px 14px 0; border-bottom:1px solid var(--line); }
  .sheet td:first-child, .sheet td b { color:var(--fg); }
  .sheet tr { transition:background-color .15s; }
  .sheet tbody tr:hover { background:var(--hover); }
`;

const startup = between('<body>', '</script>');
const splash = between('<div class="splash"', '<div class="cursor" id="cursor" aria-hidden="true"></div>');
const header = between('<header>', '</header>').replace('href="#top"', 'href="./"');
const footer = between('<footer>', '<div class="fline" id="fline" aria-hidden="true"></div>');
const script = site.slice(site.lastIndexOf('<script>'));

// One page: an opening (title, a line that lights word by word, a lead and a small note), then sections
// with a name in the side list each.
const page = ({ file, title, description, heading, tagline, lead, small, sections }) => {
  const head = between('<!doctype html>', '</style>', false)
    .replace('<title>Meloir</title>', '<title>Meloir · ' + escape(title) + '</title>')
    .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="' + escape(description) + '">')
    + extraCss + '</style>\n</head>\n';
  const nav = `<nav class="side" id="side" aria-label="Sections">
  <i class="mark" id="mark"></i>
  ${sections.map(s => `<a href="#${s.id}">${escape(s.short || s.title)}</a>`).join('')}
</nav>`;
  const main = `<main id="top">
  <div class="wrap">
    <section class="hero short">
      <h1>${escape(heading)}</h1>
      <p class="tagline" id="tagline">${escape(tagline)}</p>
      ${lead ? `<p class="lead fade" style="--n:6">${inline(lead)}</p>` : ''}
      ${small ? `<p class="small fade" style="--n:7">${inline(small)}</p>` : ''}
    </section>
${sections.map(s => `    <section class="band" id="${s.id}">
      <h2 class="rv sweep">${escape(s.title)}</h2>
      ${s.blocks.map(block).join('\n      ')}
    </section>`).join('\n')}
  </div>
</main>`;
  fs.writeFileSync(path.join(out, file), [head, startup, splash, header, nav, main, footer, script].join('\n\n'));
  console.log(file + ' written with ' + sections.length + ' sections');
};

// Privacy: a title, the date, an opening paragraph, then sections that start with "## ".
{
  const [intro, ...parts] = read('PRIVACY.md').split(/\n(?=## )/);
  const introBlocks = intro.split(/\n{2,}/);
  const updated = introBlocks.find(b => /^\*.*\*$/.test(b)).replace(/\*/g, '');
  const opening = introBlocks.filter(b => !/^# |^\*/.test(b)).join(' ');
  const [tagline, ...rest] = opening.split(/(?<=\.) /);
  const SHORT = { 'What stays on your PC': 'On your PC', 'What goes to other services': 'Other services', 'Your Spotify account': 'Your account' };
  page({
    file: 'privacy.html', title: 'Privacy', description: 'What Meloir keeps on your PC and what it sends to other services.',
    heading: 'Privacy', tagline, lead: rest.join(' '), small: updated,
    sections: parts.map(part => {
      const [h, ...blocks] = part.split(/\n{2,}/);
      const title = h.replace(/^## /, '');
      return { title, short: SHORT[title], id: idOf(title), blocks };
    }),
  });
}

// Changelog: a version per "## ", with its date in italics. Versions not released yet stay off the site.
{
  const [intro, ...parts] = read('CHANGELOG.md').split(/\n(?=## )/);
  const lead = intro.split(/\n{2,}/).filter(b => !/^# /.test(b)).join(' ');
  const versions = parts.map(part => {
    const [h, ...blocks] = part.split(/\n{2,}/);
    const version = h.replace(/^## /, '');
    return { title: 'Meloir ' + version, short: version, id: 'v' + idOf(version), blocks };
  }).filter(v => !v.blocks.some(b => /^\*Not released yet\*$/.test(b)));
  page({
    file: 'changelog.html', title: 'Changelog', description: 'What changed in each version of Meloir.',
    heading: 'Changelog', tagline: lead, small: 'Downloads for every version are on [GitHub](https://github.com/pascalnot/Meloir/releases).',
    sections: versions,
  });
}
