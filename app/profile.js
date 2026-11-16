// Swiftboard profile: an account's public record, links, entries and payouts from one request.
import { getProfile } from './cached-api.js';
import { $, avatar, day, esc, isLive, markdown, ordinal, patchHtml, patchList, setText, usd, when } from './views.js';

const PAGE_SIZE = 25;

/** An account's public profile; its entries are paged, 25 more a click. */
export function profileView(handle) {
  const root = $('profile');
  if (!root._f) {
    root.innerHTML = PROFILE;
    root._f = {};
    for (const el of root.querySelectorAll('[data-f]')) root._f[el.dataset.f] = el;
    root._f.more.addEventListener('click', () => {
      root._shown += PAGE_SIZE;
      paintEntries(root);
    });
  }
  if (root._handle !== handle) {
    root._handle = handle;
    root._shown = PAGE_SIZE;
    $('view').scrollTop = 0;
    paintProfile(root, { handle, record: {}, entries: [], payouts: [] });
  }
  return getProfile(handle, (p) => root._handle === handle && paintProfile(root, p));
}

function paintProfile(root, p) {
  const f = root._f;
  const r = p.record;
  root._profile = p;
  document.title = `@${p.handle} · Swiftboard`;
  avatar(f.picture, p.image, p.handle);
  setText(f.handle, '@' + p.handle);
  setText(f.name, [p.name, p.house && 'house account', p.joined && `joined ${day(p.joined)}, ${new Date(p.joined).getUTCFullYear()}`].filter(Boolean).join(' · '));
  patchHtml(f.bio, markdown(p.bio));
  const links = [
    p.github && ['GitHub', 'https://github.com/' + p.github, p.github],
    p.x && ['X', 'https://x.com/' + p.x, '@' + p.x],
    p.discord && ['Discord', '', p.discord],
    p.wallet && ['Wallet', p.wallet[1], p.wallet[0].slice(0, 4) + '…' + p.wallet[0].slice(-4)],
  ].filter(Boolean);
  patchHtml(f.links, links.map(([kind, url, text]) => `<span>${kind} ${url ? `<a href="${esc(url)}" rel="noopener">${esc(text)}</a>` : `<b>${esc(text)}</b>`}</span>`).join(''));
  const stats = [
    ['Prizes won', usd(r.prize_usd)],
    ['Best place', r.best_placement ? ordinal(r.best_placement) : '–'],
    ['Entered', r.competitions_entered ?? '–'],
    ['Placed', r.competitions_placed ?? '–'],
    ['Wins', r.competitions_won ?? '–'],
    ['Podiums', r.podium_finishes ?? '–'],
  ];
  patchHtml(f.record, stats.map(([name, value], i) => `<div class="stat${i ? '' : ' pot'}"><small>${name}</small><b>${value}</b></div>`).join(''));
  paintEntries(root);
  f.paidBox.hidden = !p.payouts.length;
  patchHtml(
    f.payouts,
    '<tr><th>Bounty</th><th>Place</th><th>Paid</th><th>Amount</th></tr>' +
      p.payouts.map((x) => `<tr><td><a href="#/bounty/${encodeURIComponent(x.slug)}">${esc(x.bounty)}</a></td><td>${ordinal(x.place)}</td><td>${x.tx ? `<a href="${esc(x.tx)}" rel="noopener">${when(x.at)}</a>` : when(x.at)}</td><td><b>${usd(x.usd)}</b></td></tr>`).join(''),
  );
}

function paintEntries(root) {
  const f = root._f;
  const all = root._profile.entries;
  setText(f.count, `Entries · ${all.length}`);
  patchList(f.entries, all.slice(0, root._shown), (e) => e.at + e.slug, makeEntry, patchEntry);
  f.more.hidden = all.length <= root._shown;
  setText(f.more, `Show ${Math.min(PAGE_SIZE, all.length - root._shown)} more of ${all.length}`);
}

function makeEntry() {
  const el = document.createElement('li');
  el.innerHTML = '<b></b><a></a><span></span>';
  return el;
}

function patchEntry(el, e) {
  const [title, bounty, facts] = el.children;
  setText(title, e.title || 'Untitled entry');
  setText(bounty, e.bounty);
  bounty.href = '#/bounty/' + encodeURIComponent(e.slug);
  const state = isLive(e) ? 'bounty live' : e.status === 'open' ? 'awaiting results' : e.status;
  const facts2 = [e.place && ordinal(e.place) + ' place', e.prize && 'won ' + usd(e.prize), e.score && `${e.metric} ${e.score}`, state, 'entered ' + day(e.at)];
  setText(facts, facts2.filter(Boolean).join(' · '));
  el.classList.toggle('won', !!e.prize);
}

const PROFILE = `<a class=back href="#/">← All bounties</a>
<div class=who2><span class=av data-f=picture><i></i></span><div><h1 data-f=handle></h1><div class=kind data-f=name></div></div></div>
<div class=bio data-f=bio></div>
<div class=links data-f=links></div>
<h2>Record</h2><div class="stats rec" data-f=record></div>
<h2 data-f=count>Entries</h2><ul class=ents data-f=entries></ul>
<button data-f=more hidden></button>
<div data-f=paidBox hidden><h2>Payouts</h2><table data-f=payouts></table></div>`;

document.head.append(
  Object.assign(document.createElement('style'), {
    textContent: `#profile{max-width:900px;padding-bottom:30px}
.who2{display:flex;align-items:center;gap:14px}.who2 .av{width:64px;height:64px;font-size:26px}
.bio p{margin:10px 0 6px;max-width:75ch}.links{display:flex;flex-wrap:wrap;gap:6px 18px;color:#465064;font-size:14px}
.rec{grid-template-columns:repeat(6,minmax(0,1fr))}.rec .stat b{font-size:21px}
.ents{list-style:none;margin:0;padding:0;background:#fff;border:1px solid #d5dae2;border-radius:10px}
.ents li{display:grid;gap:1px;padding:8px 12px;border-top:1px solid #e9ecf1}.ents li:first-child{border:0}.ents b{overflow-wrap:anywhere}.ents a{justify-self:start;font-size:14px}.ents span{font-size:13px;color:#465064}.ents .won span{color:#08692f;font-weight:600}
#profile button{margin:10px 0;font-size:14px;padding:6px 16px}
@media(max-width:820px){.rec{grid-template-columns:repeat(3,minmax(0,1fr))}.rec .stat{padding:7px 9px}.rec .stat b{font-size:18px}}`,
  }),
);
