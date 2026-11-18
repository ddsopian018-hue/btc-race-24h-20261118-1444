// Snapback: a sharp-drop bounce bot for cbBTC on 1-minute bars.
//
// The idea, in one line: Bitcoin's 1-minute price mean-reverts hard at the
// 10-20 minute horizon — a steep fall usually snaps part of the way back
// within minutes — but the snap is only worth trading once the fall has
// actually stopped. So the bot waits for a sharp 12-minute drop that has
// just turned up over the last 3 bars, buys a fixed $600 stake, and gets
// out as soon as the bounce's own momentum fades.
//
// Why this shape, and what it deliberately does NOT do:
//   - It never chases a rising market. A 1-minute up-move that keeps going
//     is usually noise; the backtests on the dev window showed trend
//     continuation and EMA crossovers bleeding out on whipsaws (round trip
//     ~26-36 bps in fees, slippage and pool impact) while sharp-drop
//     bounces kept a positive edge across perturbed replays of the data.
//   - It never buys a falling knife: the entry needs the 3-bar return to
//     have turned positive, i.e. the drop has stabilised. Entering mid-drop
//     (no turn confirmation) lost money in every test.
//   - It never buys near a rolling low just because the price is low: in a
//     down market that is usually a price still falling. Only a *sharp*
//     drop qualifies, because a sharp drop is what snaps back.
//   - It exits on the bounce's own fade (3-bar return <= -10 bps while in
//     profit) instead of a fixed take-profit: a fixed target cuts winners
//     short when the snap runs far and lets losers run when it stalls. A
//     +100 bps take-profit and a -80 bps stop sit behind the fade exit as
//     backstops, plus a 120-bar max hold so no position is ever carried
//     overnight through a grinding downtrend.
//
// Sizing: a fixed $600 stake (60% of the $1,000 capital). A full-size
// round trip pays ~36 bps in fees, slippage and impact against this pool's
// depth; $600 keeps the impact leg near 7 bps, so a typical +50-100 bps
// snap still nets a profit after costs, while the stake is large enough
// for the snap to matter. The stake is capped by the cash on hand.
//
// Determinism: the bot is a pure function of the bars it has been sent.
// It reads no clock, no environment and no randomness (the seed from
// hello is not needed: there is nothing random to seed). All arithmetic
// on prices is float64 on the raw integer closes, in a fixed order, so
// two runs on the same bars give the same orders.
//
// Protocol: agent-fun/bars-replay/v1, spoken through the kit's shim in
// vendor/makefun-bars.ts. The harness sends hello once, then one batch
// per bar (the bar that just closed, the fills of the previous orders,
// the account), then done. The bot answers every batch with exactly one
// reply echoing its seq. Orders decided on batch t fill at the next bar's
// open, which is why every signal is read off the close just received.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

/** The drop that qualifies as "sharp": 12-bar return at or below -55 bps. */
const DROP_WINDOW = 12;
const DROP_BPS = 55;
/** The turn that proves the drop has stopped: 3-bar return above 0. */
const TURN_WINDOW = 3;
/** Fixed stake per trade, in quote units ($600 = 600,000,000 micro-USDC). */
const STAKE_QUOTE_UNITS = 600_000_000n;
/** Take profit: position worth 100 bps over its cost (fees included). */
const TAKE_PROFIT_BPS = 100n;
/** Stop loss: position worth 80 bps under its cost. */
const STOP_BPS = 80n;
/** Fade exit: 3-bar return at or below -10 bps while the trade is in profit. */
const FADE_WINDOW = 3;
const FADE_BPS = 10;
/** Max hold: 120 bars, so a stale position is never carried for hours. */
const MAX_HOLD_BARS = 120;
/** Slippage cap on every order: 100 bps past the close it was decided on. */
const MAX_SLIPPAGE_BPS = 100;

const BPS_DEN = 10_000n;

/** Closes seen so far, as raw integer prices (price_scale 5: $65,083.31 = 6508331 raw). */
const closes: number[] = [];
/** Index (into closes) of the bar the current position was entered on, or -1. */
let entryBar = -1;

/** Return in basis points of the close `window` bars back to the latest close. */
function returnBps(window: number): number {
  const n = closes.length;
  if (n <= window) return 0;
  const now = closes[n - 1];
  const then = closes[n - 1 - window];
  return ((now - then) / then) * 10_000;
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar !== undefined) closes.push(Number(bar.c));
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined && held.qty > 0n) {
      // --- exits, checked in order: take profit, fade, stop, max hold ---
      const value = state.value(SYMBOL, held.qty);
      const cost = held.cost;
      if (value * BPS_DEN >= cost * (BPS_DEN + TAKE_PROFIT_BPS)) {
        entryBar = -1;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput];
      }
      if (value > cost && returnBps(FADE_WINDOW) <= -FADE_BPS) {
        entryBar = -1;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput];
      }
      if (value * BPS_DEN <= cost * (BPS_DEN - STOP_BPS)) {
        entryBar = -1;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput];
      }
      if (entryBar >= 0 && closes.length - 1 - entryBar >= MAX_HOLD_BARS) {
        entryBar = -1;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput];
      }
      return [];
    }

    // --- entry: sharp 12-bar drop that has just turned up ---
    if (closes.length <= DROP_WINDOW) return [];
    if (returnBps(DROP_WINDOW) > -DROP_BPS) return [];
    if (returnBps(TURN_WINDOW) <= 0) return [];
    const stake = state.cash < STAKE_QUOTE_UNITS ? state.cash : STAKE_QUOTE_UNITS;
    if (stake < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    entryBar = closes.length - 1;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: stake, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies BuyInput];
  },
});
