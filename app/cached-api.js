// Swiftboard data layer: read-only GETs of make.fun's public API, cached, revalidated and shared.
export const API = 'https://make.fun/api';

/**
 * Paint the cached answer at once (memory, then sessionStorage), then revalidate it.
 * `patch(data)` runs for the cached copy and again only when the server sent something new; `slim` keeps only
 * what the views read. make.fun's ETags are bound to the minute, so a copy from this minute is served as it is.
 * A view's request is aborted when the view is left; the board passes no signal and is never aborted.
 */
export async function cachedGet(path, patch, slim, signal = stale.signal) {
  const hit = etagCache.get(path) || restore(path);
  if (hit) patch(hit.data);
  if (hit && sameMinute(hit.at)) {
    // Answered from the cache with no request: counted, and shown in the header beside the request count.
    requests.cached += 1;
    requests.view.cached += 1;
    return hit.data;
  }
  try {
    const fresh = await revalidateEtag(path, hit, slim, signal);
    if (fresh !== hit) patch(fresh.data);
    return fresh.data;
  } catch (err) {
    if (hit && err.name !== 'AbortError') return hit.data;
    throw err;
  }
}

/**
 * One conditional request a path, shared by its callers. `cache: 'no-cache'` has the browser send If-None-Match
 * with the ETag it stored, with no preflight; make.fun's 304 carries no CORS header, so a script could not read
 * one it asked for itself. An answer bearing the ETag already held is the 304 case: the copy is kept as it is
 * and the body is neither parsed nor painted again.
 */
function revalidateEtag(path, hit, slim, signal) {
  const shared = inflight.get(path);
  if (shared && !(shared.signal && shared.signal.aborted)) return shared.job;
  const job = fetch(API + path, { signal: signal || undefined, cache: 'no-cache' })
    .then(async (res) => {
      requests.count += 1;
      requests.view.count += 1;
      if (!res.ok) throw new Error(res.status === 404 ? 'make.fun has nothing at this address' : `make.fun answered ${res.status}`);
      const etag = res.headers.get('ETag');
      if (hit && etag && etag === hit.etag) {
        // Revalidated and unchanged: counted, and shown in the header.
        requests.unchanged += 1;
        requests.view.unchanged += 1;
        return remember(path, hit, true);
      }
      return remember(path, { etag, data: slim(await res.json()) });
    })
    .finally(() => inflight.get(path)?.job === job && inflight.delete(path));
  inflight.set(path, { job, signal });
  return job;
}

/** Abort the requests of the view being left; the board's own request is never aborted. */
export function abortStale() {
  stale.abort();
  stale = new AbortController();
  // A new address is a new view: its counts start again. A revalidation of the same address keeps adding to them.
  if (requests.view.of !== location.hash) requests.view = { of: location.hash, count: 0, cached: 0, unchanged: 0 };
}

export const getBoard = (patch) => cachedGet('/competitions?status=open&activity=times', patch, slimBoard, null);
export const getBounty = (slug, patch) => cachedGet(`/competitions/${slug}?submissions=summary`, patch, slimBounty);
export const getLeaderboard = (slug, phase, patch) => cachedGet(`/competitions/${slug}/leaderboard?rows=first${phase ? '&phase=' + phase : ''}`, patch, slimRows);
export const getProfile = (handle, patch) => cachedGet(`/profiles/${handle}`, patch, slimProfile);

const etagCache = new Map();
const inflight = new Map();
let stale = new AbortController();
/** How many answers came over the network this visit, shown in the header. */
export const requests = { count: 0 };
const STORE_PREFIX = 'swiftboard:';
const STORE_MAX_CHARS = 300000;
const sameMinute = (at) => Math.floor(at / 60000) === Math.floor(Date.now() / 60000);

/** Keep an answer in memory and, when small enough, in sessionStorage. A 304 keeps the same data object. */
function remember(path, entry) {
  entry.at = Date.now();
  etagCache.set(path, entry);
  try {
    const text = JSON.stringify(entry);
    if (text.length < STORE_MAX_CHARS) sessionStorage.setItem(STORE_PREFIX + path, text);
  } catch {}
  return entry;
}

function restore(path) {
  try {
    const entry = JSON.parse(sessionStorage.getItem(STORE_PREFIX + path));
    if (entry) etagCache.set(path, entry);
    return entry;
  } catch {}
}

/** What the board and a bounty's page read of a listing; the raw board answer is about 240 KB, this a few. */
const slimListing = (b) => ({
  slug: b.slug,
  title: b.title,
  summary: b.summary,
  description: b.description,
  category: b.category,
  sponsor: b.sponsor && b.sponsor.name,
  status: b.status,
  deadline: b.deadline,
  published: b.publishedAt,
  reward: b.rewardAmount,
  pot: b.potUsd ?? b.rewardAmount,
  fee: b.entryFeeUsd,
  fees: b.entryFeesUsd,
  payers: b.entryFeePayers,
  rewards: b.rewardsNow ? b.rewardsNow.map((r) => [r.place, r.baseUsd, r.feeShareUsd, r.amountUsd]) : Object.entries(b.rewards || {}).map(([place, usd]) => [+place, usd, 0, usd]),
  entries: b.submissionCount,
});

function slimBoard(answer) {
  return answer.items.map(slimListing);
}

function slimBounty(b) {
  return {
    ...slimListing(b),
    rules: b.rules,
    opens: b.opensAt,
    resolved: b.resolvedAt,
    passed: b.submissionsPassed,
    winner: b.winner && b.winner.handle,
    metric: b.resolution && b.resolution.metric && b.resolution.metric.name,
    phases: (b.phases || []).map((p) => ({ title: p.title, starts: p.startsAt, ends: p.endsAt, finalized: p.finalizedAt })),
  };
}

/** A win rate in millionths reads as a percentage; any other score reads as the API displays it. */
const scoreText = (column, value, display) => (/_micro$/.test((column && column.source) || '') && value != null ? (value / 10000).toFixed(2) + '%' : display ?? '–');

/** A leaderboard read with ?rows=first: ten whole rows and the rest light, flattened to one array of small rows. */
function slimRows(board) {
  const key = board.rank_key;
  const column = (board.columns || []).find((c) => c.key === key);
  const whole = (board.entries || []).map((e) => [e.rank, e.handle, e.title, scoreText(column, e.values && e.values[key], e.display && e.display[key]), e.prize_rank, e.image, e.house || e.baseline]);
  const rest = (board.rest || []).map((e) => [e.rank, e.handle, e.title, scoreText(column, e.value, e.display), e.prize_rank, null, e.house || e.baseline]);
  return {
    phase: board.phase && board.phase.key,
    visible: board.phase && board.phase.scores_visible,
    column: (column && column.title) || 'Score',
    rows: whole.concat(rest),
  };
}

function slimProfile(p) {
  return {
    handle: p.handle,
    name: p.display_name,
    bio: p.bio,
    image: (p.avatar && p.avatar.url_small) || p.image,
    joined: p.joined_at,
    house: p.house,
    github: p.github_login,
    x: p.x && p.x.username,
    discord: p.discord && p.discord.username,
    wallet: p.wallet && [p.wallet.address, p.wallet.explorer_url],
    record: p.record || {},
    entries: (p.solutions || []).map((s) => ({
      title: s.title,
      slug: s.competition.slug,
      bounty: s.competition.title,
      status: s.competition.status,
      deadline: s.competition.deadline,
      place: s.placement,
      prize: s.prize_usd,
      score: s.score && scoreText(s.score.column, s.score.value, s.score.display),
      metric: s.score && s.score.column.title,
      at: s.entered_at,
    })),
    payouts: (p.payouts || []).map((x) => ({ at: x.paid_at, usd: x.amount_usd, place: x.place, slug: x.competition.slug, bounty: x.competition.title, tx: x.explorer_url })),
  };
}

// Two more counts beside `requests.count`, kept by cachedGet and revalidateEtag above: answers served from the
// cache with no request, and revalidations that came back 304 with nothing new.
requests.cached = 0;
requests.unchanged = 0;

// The same three counts for the view now on screen alone, shown in the header. cachedGet and revalidateEtag add
// to them as they answer; abortStale starts them again when the address changes.
requests.view = { of: null, count: 0, cached: 0, unchanged: 0 };
