// Swiftboard leaderboard: one request (?rows=first), then a virtual list that keeps only the rows in view in the DOM.
import { getBounty, getLeaderboard } from './cached-api.js';
import { $, AVATAR, avatar, bountyHead, listing, patchHtml, setText, usd } from './views.js';

export const ROW_HEIGHT = 46;
const OVERSCAN_ROWS = 5;

/** A bounty's leaderboard: rank, entrant, score and reward, thousands of rows scrolled through a small pool. */
export async function leaderboardView(slug, phase) {
  const root = $('leaderboard');
  if (!root._list) {
    root.innerHTML = LEADERBOARD;
    const [head, tools, columns, viewport] = root.children;
    root._head = head;
    [root._filter, root._phases, root._count] = tools.children;
    root._score = columns.children[2];
    root._list = virtualList(viewport, fillRow, (from, to, total, pool) =>
      setText(root._count, total ? `rows ${from + 1}–${to} of ${total.toLocaleString('en-US')} · ${pool} in the DOM` : 'no rows'),
    );
    root._filter.addEventListener('input', () => filterRows(root));
  }
  const key = slug + '/' + (phase || '');
  if (root._key !== key) {
    root._key = key;
    root._board = null;
    root._filter.value = '';
    root._list.setRows([], true);
    paintHead(root, slug, listing(slug));
  }
  const bounty = listing(slug) || (await getBounty(slug, () => {}));
  root._prizes = new Map(bounty.rewards.map((r) => [r[0], r[3]]));
  paintHead(root, slug, bounty);
  return getLeaderboard(slug, phase, (board) => root._key === key && paintLeaderboard(root, slug, board));
}

/**
 * A windowed list. The spacer is as tall as all the rows together; a small pool of row elements is moved and
 * refilled as the window scrolls, at most once a frame, and a row already showing the right entry is left alone.
 * The DOM holds the rows in view plus a few either side, whether the board has forty entries or ten thousand.
 */
function virtualList(viewport, fillRow, report) {
  const spacer = viewport.firstChild;
  const pool = [];
  let rows = [];
  let frameQueued = false;
  let pass = 0;

  function renderWindow() {
    frameQueued = false;
    const top = viewport.scrollTop;
    const bottom = top + viewport.clientHeight;
    const from = Math.max(0, Math.floor(top / ROW_HEIGHT) - OVERSCAN_ROWS);
    const to = Math.min(rows.length, Math.ceil(bottom / ROW_HEIGHT) + OVERSCAN_ROWS);
    while (pool.length < to - from) pool.push(spacer.appendChild(makeRow()));
    pass += 1;
    for (let index = from; index < to; index++) {
      const el = pool[index % pool.length];
      el._pass = pass;
      el.hidden = false;
      if (el._row === rows[index]) continue;
      el._row = rows[index];
      el.style.transform = `translateY(${index * ROW_HEIGHT}px)`;
      fillRow(el, rows[index]);
    }
    for (const el of pool) if (el._pass !== pass) el.hidden = true;
    report(Math.min(rows.length, Math.floor(top / ROW_HEIGHT)), Math.min(rows.length, Math.ceil(bottom / ROW_HEIGHT)), rows.length, pool.length);
  }

  function queueFrame() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(renderWindow);
  }

  viewport.addEventListener('scroll', queueFrame, { passive: true });
  addEventListener('resize', queueFrame);
  return {
    setRows(next, toTop, emptyText) {
      rows = next;
      spacer.style.height = rows.length * ROW_HEIGHT + 'px';
      spacer.dataset.empty = emptyText || '';
      if (toTop) viewport.scrollTop = 0;
      renderWindow();
    },
  };
}

function paintHead(root, slug, bounty) {
  document.title = `Leaderboard · ${bounty ? bounty.title : slug} · Swiftboard`;
  patchHtml(root._head, bountyHead(bounty, slug, 1));
}

function paintLeaderboard(root, slug, board) {
  if (root._board === board) return;
  root._board = board;
  const at = `#/bounty/${encodeURIComponent(slug)}/leaderboard`;
  const phases = [['dev', 'Development'], ['final', 'Final']].map(([key, title]) => `<a href="${at}/${key}"${board.phase === key ? ' class=on' : ''}>${title}</a>`);
  patchHtml(root._phases, phases.join(''));
  setText(root._score, board.column);
  root._filter.placeholder = `Filter ${board.rows.length.toLocaleString('en-US')} entries by handle or title`;
  root._empty = board.visible === false ? 'Scores for this phase are held until its results are published.' : 'No entries are listed for this phase yet.';
  filterRows(root);
}

function filterRows(root) {
  const board = root._board;
  if (!board) return;
  const find = root._filter.value.trim().toLowerCase();
  const rows = find ? board.rows.filter((r) => (r[1] + ' ' + r[2]).toLowerCase().includes(find)) : board.rows;
  root._list.setRows(rows, false, rows.length ? '' : find ? 'No entry matches.' : root._empty);
}

function makeRow() {
  const el = document.createElement('div');
  el.className = 'lrow';
  el.innerHTML = `<span class=num></span>${AVATAR}<span class=who><a></a><span></span></span><b class=num></b><span class="num prize"></span>`;
  return el;
}

function fillRow(el, [rank, handle, title, score, prizeRank, image, house]) {
  const [place, picture, who, value, prize] = el.children;
  const [name, entry] = who.children;
  const reward = el.parentNode.parentNode.parentNode._prizes.get(prizeRank);
  setText(place, rank == null ? '–' : String(rank));
  avatar(picture, image, handle);
  setText(name, '@' + handle + (house ? ' · house' : ''));
  name.href = '#/u/' + encodeURIComponent(handle);
  setText(entry, title || '');
  setText(value, score);
  setText(prize, reward ? usd(reward) : '–');
  el.classList.toggle('paid', !!reward);
}

const LEADERBOARD = `<div></div>
<div class=tools><input type=search aria-label="Filter entries"><nav class=phases aria-label="Phase"></nav><small class=num></small></div>
<div class="lrow lhead"><span>Rank</span><span>Entrant and entry</span><span></span><span>Reward</span></div>
<div class=vlist><div class=space></div></div>`;

document.head.append(
  Object.assign(document.createElement('style'), {
    textContent: `#leaderboard{display:flex;flex-direction:column;height:100%}
.tools{display:flex;align-items:center;gap:12px;margin:12px 0 8px}.tools input{flex:1;min-width:0;max-width:380px;font:inherit;padding:6px 12px;border:1px solid #c5ccd8;border-radius:8px}.tools small{flex:1;text-align:right;color:#465064}
.phases{display:flex;border:1px solid #c5ccd8;border-radius:8px;overflow:hidden;font-size:13px}.phases a{padding:6px 10px;background:#fff;color:#465064;text-decoration:none}.phases a.on{background:#10151f;color:#fff}
.vlist{flex:1;min-height:240px;overflow:auto;background:#fff;border:1px solid #d5dae2;border-radius:0 0 10px 10px}
.space{position:relative;min-height:100%}.space:after{content:attr(data-empty);position:absolute;inset:16px;color:#465064}
.lrow{position:absolute;left:0;right:0;top:0;height:${ROW_HEIGHT}px;display:grid;grid-template-columns:52px 28px minmax(0,1fr) 120px 84px;align-items:center;gap:12px;padding:0 14px;border-bottom:1px solid #e9ecf1}
.lrow>.num{text-align:right}.lrow>.num:first-child{text-align:left;font-weight:700;color:#465064}.lrow b{font-size:16px}
.lrow.paid .prize{font-weight:700;color:#08692f}.lrow.paid>.num:first-child{color:#10151f}
.who{display:grid;line-height:1.25}.who a{font-weight:650;text-decoration:none;color:#10151f;justify-self:start}.who a:hover{text-decoration:underline}.who span{font-size:12.5px;color:#465064}.who>*{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.lhead{position:static;height:34px;grid-template-columns:52px minmax(0,1fr) 120px 84px;background:#f3f5f8;border:1px solid #d5dae2;border-bottom:0;border-radius:10px 10px 0 0;font-size:12px;line-height:1.1;font-weight:700;color:#566074;text-transform:uppercase;letter-spacing:.04em}
.lhead span:nth-child(n+3){text-align:right}
@media(max-width:820px){.lrow{grid-template-columns:30px 28px minmax(0,1fr) 68px 58px;gap:8px;padding:0 10px}.lhead{grid-template-columns:30px minmax(0,1fr) 68px 58px;font-size:10.5px;letter-spacing:0}.lrow b{font-size:15px}.tools{gap:8px}.tools small{display:none}}`,
  }),
);
