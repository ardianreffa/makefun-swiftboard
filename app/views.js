// Swiftboard views: the bounty board and a bounty's page, both patched in place, never rebuilt.
import { getBoard, getBounty } from './cached-api.js';

export const $ = (id) => document.getElementById(id);

/** Say what went wrong in place of the surface (an unknown bounty or handle, the network), or clear it. */
export function notice(text) {
  const el = $('notice');
  el.hidden = !text;
  if (text) for (const id of ['bounty', 'leaderboard', 'profile']) $(id).hidden = true;
  setText(el.firstChild, text);
}
$('view').insertAdjacentHTML('afterbegin', '<p id=notice hidden><span></span><a href="#/">Back to the board</a></p>');
document.querySelector('header').insertAdjacentHTML('beforeend', '<small id=net></small>');

/** Keyed list patch: rows are made once, moved only when their order changes, and dropped when gone. */
export function patchList(parent, items, keyOf, make, update) {
  const rows = parent._rows || (parent._rows = new Map());
  const seen = new Set();
  let at = parent.firstChild;
  for (const item of items) {
    const key = keyOf(item);
    let el = rows.get(key);
    if (!el) rows.set(key, (el = make(item)));
    update(el, item);
    seen.add(key);
    if (el === at) at = at.nextSibling;
    else parent.insertBefore(el, at);
  }
  for (const [key, el] of rows) if (!seen.has(key)) (el.remove(), rows.delete(key));
}

/** Write text only when it changed, so a refresh that brings nothing new touches nothing. */
export function setText(el, text) {
  if (el._text !== text) el.textContent = el._text = text;
}

export function patchHtml(el, html) {
  if (el._html !== html) el.innerHTML = el._html = html;
}

/** Tick every countdown on the page from its deadline; no request is made. */
export function patchCountdowns() {
  for (const el of document.querySelectorAll('[data-until]')) setText(el, timeLeft(el.dataset.until, el.dataset.exact));
  for (const el of document.querySelectorAll('[data-next]')) setText(el, closesIn(el.dataset.next));
  if (listed.length && listed.filter(isLive).length !== liveCount) {
    paintBoard(listed);
    const shown = $('bounty')._bounty;
    if (shown) paintBounty(shown);
  }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

export function usd(value) {
  const n = Number(value) || 0;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

export const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;

export function ordinal(n) {
  const tail = n % 100;
  return n + (tail > 10 && tail < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
}

const two = (n) => String(n).padStart(2, '0');

export function ago(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return min + 'm ago';
  if (min < 1440) return Math.floor(min / 60) + 'h ago';
  return Math.floor(min / 1440) + 'd ago';
}

/** A deadline as time left: '1d 3h left' in a list, '1d 3h 12m 05s' when exact, 'ended 2d ago' once it has passed. */
export function timeLeft(iso, exact) {
  const ms = Date.parse(iso) - Date.now();
  if (!(ms > 0)) return 'ended ' + ago(-ms);
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor(s / 60) % 60;
  if (exact) return `${d ? d + 'd ' : ''}${h}h ${two(m)}m ${two(s % 60)}s`;
  if (d) return `${d}d ${h}h left`;
  if (h) return `${h}h ${m}m left`;
  return `${m}m ${two(s % 60)}s left`;
}

export const num = (n) => Number(n || 0).toLocaleString('en-US');

// Every date on the page is UTC, as make.fun states its deadlines: 'Nov 17' and 'Nov 17, 12:30 UTC'.
const UTC_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const UTC_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const day = (iso) => (iso ? UTC_DAY.format(new Date(iso)) : '–');
export const hour = (iso) => (iso ? `${day(iso)}, ${UTC_TIME.format(new Date(iso))}` : '–');
export const when = (iso) => (iso ? hour(iso) + ' UTC' : '–');

/** Still taking entries: decided by the deadline, since a bounty reads `open` until its results are published. */
export const isLive = (b) => b.status === 'open' && Date.parse(b.deadline) > Date.now();

export function statusOf(b) {
  if (b.opens && Date.parse(b.opens) > Date.now()) return ['soon', 'Not open yet'];
  if (isLive(b)) return ['live', 'Live · taking entries'];
  if (b.status === 'open') return ['over', 'Entries closed · awaiting results'];
  return ['done', b.status === 'resolved' ? 'Resolved · results published' : 'Closed'];
}

/** A make.fun image address: the API gives a path for its own avatars and a full URL for linked ones. */
export const imageUrl = (src) => (src && src[0] === '/' ? 'https://make.fun' + src : src || '');

/** An avatar: the handle's initial, with the picture over it once it loads (crossorigin is set before src). */
export function avatar(el, src, handle) {
  setText(el.firstChild, (handle || '?')[0].toUpperCase());
  const url = imageUrl(src);
  let img = el.lastChild;
  if (img.tagName !== 'IMG') {
    if (!url) return;
    img = document.createElement('img');
    img.alt = '';
    img.crossOrigin = 'anonymous';
    img.addEventListener('error', () => (img.hidden = true));
    el.append(img);
  }
  if (img._src !== url) {
    img.hidden = !url;
    if (url) img.src = url;
    img._src = url;
  }
}
export const AVATAR = '<span class=av><i></i></span>';

/** Headings, lists, paragraphs, `code`, **bold** and links; everything else is escaped text. */
export function markdown(text) {
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
  let html = '';
  let open = '';
  for (const line of String(text || '').split('\n')) {
    const item = line.match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)/);
    const head = line.match(/^#{1,6}\s+(.*)/);
    const list = item ? (item[1] ? 'ol' : 'ul') : '';
    if (list !== open) {
      html += (open ? `</${open}>` : '') + (list ? `<${list}${item[1] ? ` start=${item[1]}` : ''}>` : '');
      open = list;
    }
    if (item) html += `<li>${inline(item[2])}</li>`;
    else if (head) html += `<h3>${inline(head[1])}</h3>`;
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  return html + (open ? `</${open}>` : '');
}

// ---------------------------------------------------------------- the board

let listed = [];
let order = [];
let liveCount = 0;
let selected = '';
let sortBy = 'soon';
const SORTS = {
  soon: (a, b) => Date.parse(a.deadline) - Date.parse(b.deadline),
  pot: (a, b) => b.pot - a.pot,
  entries: (a, b) => b.entries - a.entries,
};

/** A listing the board already holds, so a bounty's page and its leaderboard paint before their own answer. */
export const listing = (slug) => listed.find((b) => b.slug === slug);

/** The board: live bounties first (by deadline, not status), each with pot, fee, time left and entries. */
export function boardView(slug) {
  if (slug !== undefined) selected = slug;
  return getBoard(paintBoard);
}

function paintBoard(list) {
  listed = list;
  const root = $('board');
  if (!root._list) {
    root.innerHTML = BOARD;
    [root._top, root._list, root._none] = root.children;
    [root._bar, root._find, root._cats, root._tally] = root._top.children;
    // Sorting and filtering read the list already in memory: no request is made and the rows stay in the DOM.
    root.addEventListener('click', (event) => {
      const { sort, cat, clear } = event.target.dataset;
      if (sort) sortBy = sort;
      else if (cat !== undefined) category = cat;
      else if (clear !== undefined) category = findText = root._find.value = '';
      else return;
      paintBoard(listed);
    });
    root._find.addEventListener('input', () => {
      findText = root._find.value.trim().toLowerCase();
      paintBoard(listed);
    });
  }
  const live = list.filter(isLive).sort(SORTS[sortBy]);
  const over = list.filter((b) => !isLive(b)).sort((a, b) => Date.parse(b.deadline) - Date.parse(a.deadline));
  liveCount = live.length;
  order = live.concat(over);
  // The category buttons are the categories the live data holds, most bounties first, after "All".
  const tally = new Map();
  for (const b of list) if (b.category) tally.set(b.category, (tally.get(b.category) || 0) + 1);
  if (category && !tally.has(category)) category = '';
  const categories = [...tally.keys()].sort((a, b) => tally.get(b) - tally.get(a) || (a < b ? -1 : 1));
  patchList(root._cats, ['', ...categories], (c) => c || '#all', makeCategory, patchCategory);
  const liveShown = live.filter(matchesFilter);
  const overShown = over.filter(matchesFilter);
  setText(root._bar.firstChild, `Live bounties · ${live.length}`);
  for (const button of root._bar.querySelectorAll('button')) button.setAttribute('aria-pressed', button.dataset.sort === sortBy);
  paintTally(root._tally, liveShown, live.length);
  const rows = over.length ? [...live, { group: `Entries closed, awaiting results · ${overShown.length}`, none: !overShown.length }, ...over] : live;
  patchList(root._list, rows, (b) => b.slug || '#over', makeRow, patchRow);
  root._none.hidden = liveShown.length + overShown.length > 0 || !list.length;
}

function makeRow(b) {
  const el = document.createElement(b.group ? 'h2' : 'a');
  if (!b.group) el.innerHTML = '<span class=t></span><b class=pot></b><span class=meta><b data-until></b><span></span><span></span></span><small></small>';
  return el;
}

function patchRow(el, b) {
  // A row the filter leaves out is hidden where it stands, not removed, so clearing the filter makes nothing.
  const hide = b.group ? b.none : !matchesFilter(b);
  if (el.hidden !== hide) el.hidden = hide;
  if (b.group) return setText(el, b.group);
  const state = 'row' + (isLive(b) ? '' : ' over') + (b.slug === selected ? ' on' : '');
  if (el.className !== state) {
    el.className = state;
    el.href = '#/bounty/' + b.slug;
    if (b.slug === selected && !hide) el.scrollIntoView({ block: 'nearest' });
  }
  const [title, pot, meta, caption] = el.children;
  const [left, entries, fee] = meta.children;
  // Closing soon: under 6 hours left. Marked by a boxed "!" as well as by colour.
  const soon = closesSoon(b) ? 'soon' : '';
  if (left.className !== soon) {
    left.className = soon;
    left.title = soon ? 'Closes within 6 hours' : '';
  }
  setText(title, b.title);
  setText(pot, usd(b.pot));
  setText(caption, +b.fees ? 'live pot' : 'reward');
  left.dataset.until = b.deadline;
  setText(left, timeLeft(b.deadline));
  setText(entries, plural(b.entries, 'entry', 'entries'));
  setText(fee, b.fee ? usd(b.fee) + ' entry fee' : 'free entry');
}

// ---------------------------------------------------------------- a bounty's page

/** The heading every bounty surface shares: back link, status, title and the Overview / Leaderboard tabs. */
export function bountyHead(b, slug, tab) {
  const [state, label] = b ? statusOf(b) : ['done', 'Loading…'];
  const at = '#/bounty/' + encodeURIComponent(slug);
  return `<a class=back href="#/">← All bounties</a>
<div class=kind><span class="pill ${state}">${label}</span> ${esc(b ? [b.category, b.sponsor && 'by ' + b.sponsor].filter(Boolean).join(' · ') : '')}</div>
<h1>${esc(b ? b.title : slug)}</h1>
<nav class=tabs><a href="${at}"${tab ? '' : ' class=on'}>Overview</a><a href="${at}/leaderboard"${tab ? ' class=on' : ''}>Leaderboard</a></nav>`;
}

const STAT = (key) => `<div class="stat ${key}"><small data-f=${key}Label></small><b data-f=${key}></b><i data-f=${key}Note></i></div>`;
const BOUNTY = `<div data-f=head></div>
<p class=lede data-f=summary></p>
<div class=stats>${['pot', 'fee', 'left', 'entries'].map(STAT).join('')}</div>
<h2 class=toph data-f=topHead></h2><div data-f=top></div>
<div class=cols><section><h2>Rewards</h2><table data-f=rewards></table></section><section><h2>Dates and status</h2><dl data-f=dates></dl></section></div>
<h2>Description</h2><div class=md data-f=about></div>
<details data-f=rulesBox><summary>Rules</summary><div class=md data-f=rules></div></details>`;

/** A bounty's page: painted at once from the board's listing, then patched with its own answer (one request). */
export function bountyView(slug = order[0] && order[0].slug) {
  const root = $('bounty');
  if (!slug) return;
  if (!root._f) {
    root.innerHTML = BOUNTY;
    root._f = {};
    for (const el of root.querySelectorAll('[data-f]')) root._f[el.dataset.f] = el;
    // The rules run to tens of kilobytes: they are rendered only when opened.
    root._f.rulesBox.addEventListener('toggle', () => root._bounty && paintBounty(root._bounty));
  }
  if (root._slug !== slug) {
    root._slug = slug;
    root._bounty = null;
    root._f.rulesBox.open = false;
    $('view').scrollTop = 0;
    paintBounty(listing(slug) || { slug, title: slug, rewards: [], entries: 0 });
    paintTopFive(slug);
  }
  if (selected !== slug) boardView(slug);
  // Two answers make the page: the bounty's own, and its leaderboard for the Top 5 (the leaderboard tab's request).
  return Promise.all([getBounty(slug, (b) => root._slug === slug && paintBounty(b)), topFive(slug)]);
}

function paintBounty(b) {
  const root = $('bounty');
  const f = root._f;
  const live = isLive(b);
  const fees = +b.fees > 0;
  root._bounty = b;
  document.title = `${b.title} · Swiftboard`;
  patchHtml(f.head, bountyHead(b.deadline ? b : null, b.slug));
  setText(f.summary, b.summary || '');

  setText(f.potLabel, fees ? 'Live pot' : 'Reward');
  setText(f.pot, usd(b.pot));
  setText(f.potNote, fees ? `${usd(b.reward)} reward + ${usd(b.fees)} fees` : b.fee ? 'entry fees add to it' : 'fixed reward, no fees added');
  setText(f.feeLabel, 'Entry fee');
  setText(f.fee, b.fee ? usd(b.fee) : 'Free');
  setText(f.feeNote, b.fee ? `${num(b.payers)} paid · once per account` : 'no fee to enter');
  setText(f.leftLabel, live ? 'Time left' : 'Deadline');
  f.left.dataset.until = b.deadline || '';
  f.left.dataset.exact = 1;
  setText(f.left, b.deadline ? timeLeft(b.deadline, 1) : '–');
  setText(f.leftNote, live ? 'until ' + when(b.deadline) : 'no longer taking entries');
  setText(f.entriesLabel, 'Entries');
  setText(f.entries, num(b.entries));
  setText(f.entriesNote, b.passed != null ? `${num(b.passed)} passed the checks` : 'submitted so far');

  patchHtml(f.rewards, rewardsTable(b));
  patchHtml(f.dates, datesList(b));
  patchHtml(f.about, markdown(b.description));
  f.rulesBox.hidden = !b.rules;
  if (f.rulesBox.open && b.rules) patchHtml(f.rules, markdown(b.rules));
}

/** The rewards table with the live pot: places that pay the same are one row, fee shares shown beside the base. */
function rewardsTable(b) {
  const groups = [];
  for (const [place, base, share, now] of b.rewards) {
    const last = groups[groups.length - 1];
    if (last && last.base === +base && last.now === +now) last.to = place;
    else groups.push({ from: place, to: place, base: +base, share: +share, now: +now });
  }
  const rows = groups.map(
    (g) => `<tr><td>${ordinal(g.from)}${g.to > g.from ? ' – ' + ordinal(g.to) : ''}</td><td>${usd(g.base)}</td><td>${g.share ? '+' + usd(g.share) : '–'}</td><td><b>${usd(g.now)}</b>${g.to > g.from ? ' each' : ''}</td></tr>`,
  );
  return `<tr><th>Place</th><th>Reward</th><th>Fee share</th><th>Pays now</th></tr>${rows.join('')}
<tr class=sum><td>${plural(b.rewards.length, 'place', 'places')}</td><td>${usd(b.reward)}</td><td>${+b.fees ? '+' + usd(b.fees) : '–'}</td><td><b>${usd(b.pot)}</b> pot</td></tr>`;
}

function datesList(b) {
  const rows = [['Status', `<span class="pill ${statusOf(b)[0]}">${statusOf(b)[1]}</span>`]];
  if (b.opens) rows.push(['Opened', when(b.opens)]);
  rows.push(['Deadline', `${when(b.deadline)} · <span data-until="${esc(b.deadline)}">${timeLeft(b.deadline)}</span>`]);
  for (const p of b.phases || []) rows.push([esc(p.title),`${hour(p.starts)} → ${when(p.ends)}${p.finalized ? ' · finalized' : ''}`]);
  if (b.resolved) rows.push(['Results', when(b.resolved)]);
  if (b.winner) rows.push(['Winner', `<a href="#/u/${encodeURIComponent(b.winner)}">@${esc(b.winner)}</a>`]);
  if (b.metric) rows.push(['Ranked by', esc(b.metric)]);
  if (b.published) rows.push(['Published', when(b.published)]);
  return rows.map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join('');
}

document.head.append(
  Object.assign(document.createElement('style'), {
    textContent: `a{color:#0b57d0}h1{font-size:25px;line-height:1.2;margin:6px 0 4px}h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#566074;margin:18px 0 8px}
#board .bar{display:flex;align-items:center;gap:5px;padding:0 4px 6px}.bar b{flex:1;font-size:16px}
button{font:inherit;font-size:12px;padding:3px 10px;border:1px solid #c5ccd8;border-radius:99px;background:#fff;color:#10151f;cursor:pointer}button[aria-pressed=true]{background:#10151f;border-color:#10151f;color:#fff}
#board h2{margin:14px 6px 4px}
.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1px 12px;padding:5px 10px;border:1px solid transparent;border-radius:9px;color:inherit;text-decoration:none}
.row:hover{background:#f3f5f8}.row.on{background:#e8f0fe;border-color:#0b57d0}
.row .t{font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pot,.stat b,td,.num{font-variant-numeric:tabular-nums}
.row .pot{font-size:17px;text-align:right;color:#08692f}.row small{text-align:right;font-size:11px;color:#566074}
.meta{display:flex;gap:6px;font-size:13px;color:#465064;white-space:nowrap}.meta b{color:#10151f}.meta span:before{content:"· "}
.row.over .pot,.row.over .meta b{color:#566074}
.back{display:none;margin-bottom:8px}.kind{font-size:13px;color:#465064}
.pill{display:inline-block;padding:1px 10px;border-radius:99px;font-size:12px;font-weight:700;background:#e2e6ed;color:#39425a}.pill.live{background:#d9f3e2;color:#08692f}.pill.over{background:#fdebc5;color:#774800}
.tabs{display:flex;gap:2px;margin:10px 0 0;border-bottom:1px solid #d5dae2}.tabs a{padding:6px 14px;font-weight:650;color:#465064;text-decoration:none;border-bottom:3px solid transparent}.tabs a.on{color:#10151f;border-color:#0b57d0}
.lede{max-width:78ch;margin:10px 0;color:#39425a}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.stat,table,dl,.md{background:#fff;border:1px solid #d5dae2;border-radius:10px}
.stat{padding:9px 12px;min-width:0}
.stat small{display:block;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#566074}
.stat b{display:block;font-size:22px;line-height:1.3;white-space:nowrap}
.stat i{display:block;font-style:normal;font-size:12.5px;color:#465064;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stat.pot b{color:#08692f}
.cols{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:0 18px}
table{width:100%;border-spacing:0}th,td{padding:5px 12px;text-align:right;white-space:nowrap;border-top:1px solid #e4e8ee}tr:first-child th{border:0}th{font-size:12px;color:#566074}th:first-child,td:first-child{text-align:left}.sum td{background:#f3f5f8;font-weight:600}
dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 14px;margin:0;padding:9px 12px;font-size:14px}dt{color:#566074}dd{margin:0;font-weight:600}
.md{padding:2px 14px;overflow-wrap:anywhere}.md h3{font-size:15px;margin:14px 0 6px}.md p,.md ul,.md ol{margin:8px 0}.md code{padding:1px 4px;border-radius:4px;background:#eef1f5;font-size:13px}
details{margin:14px 0 30px}summary{padding:8px 2px;font-weight:650;cursor:pointer}
.av{position:relative;display:inline-grid;place-items:center;flex:none;width:28px;height:28px;border-radius:50%;background:#d5dae2;color:#39425a;font-size:13px;font-weight:700;overflow:hidden}.av i{font-style:normal}.av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#notice{padding:14px;background:#fff;border:1px solid #d5dae2;border-radius:10px}
.top{position:sticky;top:-12px;z-index:1;margin-top:-12px;padding-top:12px;background:#fff}.row{scroll-margin-top:150px}
#board input{display:block;width:100%;font:inherit;font-size:13.5px;padding:3px 10px;border:1px solid #c5ccd8;border-radius:8px;background:#fff;color:#10151f}
.cats{display:flex;flex-wrap:wrap;gap:4px;margin:5px 0 0}.cats button{padding:1px 7px}
.tally{margin:5px 2px 0;font-size:12px;color:#465064;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tally b{color:#10151f}.tally b:nth-of-type(2){color:#08692f}
.heads{display:flex;align-items:center;gap:8px;margin:5px 0 2px;padding:3px 10px;border-block:1px solid #e4e8ee;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#566074;white-space:nowrap}.heads span:first-child{flex:1}
.soon{padding:0 6px 0 2px;border:1px solid #c98a1b;border-radius:99px;background:#fdebc5;color:#5f3900}.meta b.soon{color:#5f3900}
.soon:before{content:"!";display:inline-block;width:13px;margin-right:4px;border-radius:50%;background:#774800;color:#fff;font-size:10.5px;font-weight:800;line-height:13px;text-align:center;vertical-align:1px}
.none{margin:14px 6px;color:#465064}
.toph a{float:right;font-size:13px;font-weight:600;letter-spacing:0;text-transform:none}
.top5{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:0;padding:0;list-style:none}.top5+p{min-height:63px;margin:0;color:#465064}
.top5 li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:0 7px;align-items:baseline;padding:7px 12px;background:#fff;border:1px solid #d5dae2;border-radius:10px}
.top5 i{font-style:normal;font-size:13px;font-weight:700;color:#566074}.top5 a{font-weight:650;color:#10151f;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.top5 a:hover{text-decoration:underline}.top5 b{grid-column:2;font-size:17px}
@media(max-width:820px){body{grid-template-rows:auto minmax(0,1fr)}header{flex-wrap:wrap;row-gap:0;padding-block:6px}#net{flex-basis:100%;overflow:hidden;text-overflow:ellipsis;font-size:10.5px}.top5{grid-template-columns:minmax(0,1fr);gap:4px}.top5 li{grid-template-columns:30px minmax(0,1fr) auto;padding:5px 12px}.top5 b{grid-column:auto}.toph a{font-size:12px}.back{display:inline-block}.stats{grid-template-columns:1fr 1fr}.cols{grid-template-columns:minmax(0,1fr)}h1{font-size:21px}.stat b{font-size:20px}th,td{padding:5px 8px}}`,
  }),
);

// ---------------------------------------------------------------- the board's filter, summary and headings

let findText = '';
let category = '';
const SOON_MS = 6 * 3600 * 1000;

/** The board's frame, made once: sort chips, filter box, category buttons, summary line, column headings, list. */
const BOARD =
  '<div class=top><div class=bar><b></b><button data-sort=soon>Soonest</button><button data-sort=pot>Pot</button><button data-sort=entries>Entries</button></div>' +
  '<input type=search placeholder="Filter bounties by title or category" aria-label="Filter bounties by title or category">' +
  '<div class=cats role=group aria-label="Filter by category"></div>' +
  '<p class=tally><b></b> open · <b></b> in pots · <b></b> entries · <span title="The nearest deadline among the bounties shown">next ends in <b data-next></b></span></p>' +
  '<div class=heads><span>Bounty · time left · entries · fee</span><span class=soon>under 6h</span><span>Pot</span></div></div>' +
  '<div></div>' +
  '<p class=none hidden>No bounty matches this filter. <button data-clear>Show all</button></p>';

/** The filter, run over the listings in memory: the chosen category, and the typed text in the title or category. */
function matchesFilter(b) {
  return (!category || b.category === category) && (!findText || `${b.title} ${b.category}`.toLowerCase().includes(findText));
}

const closesSoon = (b) => isLive(b) && Date.parse(b.deadline) - Date.now() < SOON_MS;

/** A deadline as '8h 42m', for the summary line's nearest deadline. */
const closesIn = (iso) => (Date.parse(iso) > Date.now() ? timeLeft(iso).replace(' left', '') : '–');

/** One line above the list: bounties taking entries, the total of their live pots, their entries, the nearest deadline. */
function paintTally(el, live, total) {
  const [count, pots, entries, next] = el.querySelectorAll('b');
  const nearest = live.reduce((min, b) => (!min || Date.parse(b.deadline) < Date.parse(min) ? b.deadline : min), '');
  setText(count, live.length === total ? num(total) : `${num(live.length)} of ${num(total)}`);
  setText(pots, usd(live.reduce((sum, b) => sum + (+b.pot || 0), 0)));
  setText(entries, num(live.reduce((sum, b) => sum + (+b.entries || 0), 0)));
  next.dataset.next = nearest;
  setText(next, closesIn(nearest));
}

function makeCategory(name) {
  const el = document.createElement('button');
  el.dataset.cat = name;
  el.textContent = name || 'All';
  return el;
}

function patchCategory(el, name) {
  const pressed = String(name === category);
  if (el.getAttribute('aria-pressed') !== pressed) el.setAttribute('aria-pressed', pressed);
}

// ---------------------------------------------------------------- a bounty's Top 5

import { getLeaderboard } from './cached-api.js';

/**
 * The bounty's current top five, read through cachedGet from the very request its leaderboard tab makes, so the
 * two share one cached answer: opening the tab afterwards costs no request, and coming back costs none either.
 * It is aborted with the view; a bounty with no leaderboard to read shows the plain line, not an error.
 */
function topFive(slug) {
  const mine = (board) => $('bounty')._slug === slug && paintTopFive(slug, board || { rows: [] });
  return getLeaderboard(slug, '', mine).catch((err) => err.name === 'AbortError' || mine());
}

/** Rank, handle and the leaderboard's own score text for the first five ranked rows; patched only when changed. */
function paintTopFive(slug, board) {
  const f = $('bounty')._f;
  const at = `#/bounty/${encodeURIComponent(slug)}/leaderboard`;
  const ranked = board ? board.rows.filter((r) => r[0] != null) : [];
  const cells = ranked.slice(0, 5).map(
    ([rank, handle, , score, , , house]) =>
      `<li><i>${ordinal(rank)}</i><a href="#/u/${encodeURIComponent(handle)}" title="@${esc(handle)}">@${esc(handle)}${house ? ' · house' : ''}</a><b class=num>${esc(score)}</b></li>`,
  );
  const all = ranked.length ? `All ${plural(ranked.length, 'ranked entry', 'ranked entries')}` : 'Full leaderboard';
  patchHtml(f.topHead, `Top 5 now${ranked.length ? ' · ' + esc(board.column) : ''} <a href="${at}">${all} →</a>`);
  patchHtml(f.top, cells.length ? `<ol class=top5>${cells.join('')}</ol>` : `<ol class=top5></ol><p>${board ? 'No ranked entries yet.' : 'Reading the leaderboard…'}</p>`);
}
