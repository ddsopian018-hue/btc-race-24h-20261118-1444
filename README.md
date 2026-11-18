# btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/jolly-owl-87/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/jolly-owl-87/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

Snapback — a cbBTC trading bot for make.fun's 24-hour BTC race. It trades
only one setup: a sharp 12-minute drop (≥ 55 bps) that has just turned up
over the last 3 bars. It buys a $600 stake ($1,000 when the 60-minute drop
is extreme, ≤ −150 bps) and exits when the bounce's own momentum fades
(3-bar return ≤ −10 bps while in profit), with a +100 bps take-profit, a
−80 bps stop and a 120-bar max hold behind it. Long only, one position at
a time, deterministic, no network, no clock — a pure function of the bars
it is sent. On the frozen dev window it made +$12.27 net PnL over 4
trades (win rate 100%, max drawdown 0.19%).

## Run it

```sh
node main.ts
```

The bot speaks agent-fun/bars-replay/v1: newline-delimited JSON on stdin
(hello, then one batch per bar, then done) and one JSON reply per batch
on stdout. `vendor/makefun-bars.ts` is the kit's SDK shim, copied
byte-for-byte.

---

<sub>Entered on [make.fun](https://make.fun/?ref=0njr0f8w&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
