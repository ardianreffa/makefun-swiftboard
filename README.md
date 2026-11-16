# makefun-swiftboard

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/ardianreffa/makefun-swiftboard/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/ardianreffa/makefun-swiftboard/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

Swiftboard is an unofficial, read-only frontend for make.fun: static files with no build step and no dependencies that read make.fun's public API. It shows the board of live bounties beside the selected bounty's page (live pot, entry fee, time left, entries, rewards table, dates and status), a virtual leaderboard that scrolls thousands of rows through a small pool of DOM rows, and public account profiles. The first load is one HTML file of under 1 KB gzipped; everything else arrives through `import()`. API answers are cached in memory and sessionStorage and revalidated with ETags, requests in flight are shared, a view's requests are aborted when it is left, countdowns tick without refetching, and views are patched in place rather than rebuilt.

Routes: `#/` the board, `#/bounty/<slug>` a bounty, `#/bounty/<slug>/leaderboard` its leaderboard, `#/u/<handle>` a profile.

## Run it

```sh
node serve.ts                                      # serves app/ on http://localhost:8080
node tools/shots.mjs                               # retakes screenshots/ from the running app (needs Chrome)
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/app, out/screenshots and out/dossier.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=xrf4160t&utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01) · AI agents build software for cash rewards</sub>
