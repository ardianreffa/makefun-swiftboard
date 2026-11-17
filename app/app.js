// Swiftboard router: four surfaces on hash routes, each patched in place.
//   #/                              the bounty board
//   #/bounty/<slug>                 a bounty's page
//   #/bounty/<slug>/leaderboard     its leaderboard
//   #/u/<handle>                    an account's public profile
import { abortStale, requests } from './cached-api.js';
import { $, boardView, bountyView, notice, patchCountdowns, setText } from './views.js';

const ROUTES = { board: boardView, bounty: bountyView, leaderboard: virtualLeaderboard, profile: profileView };

async function virtualLeaderboard(slug, phase) {
  return (await import('./leaderboard.js')).leaderboardView(slug, phase);
}

async function profileView(handle) {
  return (await import('./profile.js')).profileView(handle);
}

function matchRoute(hash) {
  const [, surface, name, tab, phase] = hash.split('/').map(decodeURIComponent);
  if (surface === 'bounty' && name) return tab === 'leaderboard' ? ['leaderboard', name, phase] : ['bounty', name];
  if (surface === 'u' && name) return ['profile', name];
  return ['board'];
}

/** Show the route's surface. Only the view being left is aborted; nothing on the page is rebuilt. */
async function route() {
  const mine = ++turn;
  let [name, ...args] = matchRoute(location.hash);
  window.__shotReady = false;
  abortStale();
  document.body.dataset.route = name;
  try {
    // The board stays on screen on every route; it only moves its highlight to the bounty being shown.
    const board = ROUTES.board(name === 'bounty' || name === 'leaderboard' ? args[0] : '');
    if (name === 'board') {
      // Beside the board a wide screen shows the first bounty; a phone shows the board alone.
      await board;
      document.title = 'Swiftboard · unofficial make.fun frontend';
      name = matchMedia('(min-width:821px)').matches ? 'bounty' : '';
    }
    for (const id of ['bounty', 'leaderboard', 'profile']) $(id).hidden = id !== name;
    notice('');
    if (name) await ROUTES[name](...args);
    await board;
  } catch (err) {
    if (err.name === 'AbortError' || mine !== turn) return;
    notice(`${err.message || err}. `);
  }
  if (mine !== turn) return;
  ticks = 0;
  // Real counts kept by cached-api.js for the view on screen, started again on each change of address:
  // network answers, answers served from memory with no request, and revalidations that came back unchanged.
  const { count, cached, unchanged } = requests.view;
  setText($('net'), `this view: ${count} API ${count === 1 ? 'request' : 'requests'} · ${cached} from cache · ${unchanged} unchanged (304)`);
  window.__shotReady = true;
}

/** Countdowns tick every second without a request; the data is revalidated once a minute while the tab shows. */
function tickCountdowns() {
  patchCountdowns();
  if (++ticks < 60 || document.hidden) return;
  // Counted from the start of the revalidation, so one slower than a second is not started (and aborted) again.
  ticks = 0;
  route();
}

let turn = 0, ticks = 0;

addEventListener('hashchange', route);
matchMedia('(min-width:821px)').addEventListener('change', route);
setInterval(tickCountdowns, 1000);
route();
