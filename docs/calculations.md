# Calculation reference

## Inputs and units

A trade provides an instrument, direction, entry, stop loss, and take profit. Long requires `stop loss < entry < take profit`; Short requires the reversed ordering. Balance and risk percentage define a monetary target. Instrument specifications provide contract size, profit currency, movement unit (`pipSize` internally), and volume defaults.

The UI uses instrument-aware distance labels. A CFD movement unit is not necessarily a forex pip or an independently verified execution tick.

## Formulas

```text
risk amount       = account balance × risk percent / 100
stop distance     = abs(entry − stop loss) / movement unit
reward distance   = abs(take profit − entry) / movement unit
value in profit currency per lot per unit = movement unit × contract size
raw lots          = risk amount / (stop distance × value per lot per unit)
reward/risk ratio = reward distance / stop distance
actual risk       = stop distance × value per lot per unit × rounded lots
actual risk %     = actual risk / account balance × 100
reward amount     = reward distance × value per lot per unit × rounded lots
```

Value per lot per unit must be expressed in account currency. If account and profit currencies match, contract valuation is direct. For applicable forex base-currency accounts, entry price provides conversion. Otherwise the app uses a supported conversion route or manual value.

### Worked example

EURUSD: USD 10,000 balance, 1% risk, entry 1.08450, stop 1.08050, target 1.09250, contract size 100,000, movement unit 0.0001, and lot step 0.01:

```text
risk amount     = 100 USD
stop distance   = 40 pips
reward distance = 80 pips
pip value       = 10 USD per lot
raw lots        = 100 / (40 × 10) = 0.25
rounded lots    = 0.25
actual risk     = 100 USD (1%)
reward amount   = 200 USD
reward/risk     = 2
```

## Rounding and minimum volume

The engine floors raw lots to the configured step and clamps to the minimum lot. The domain API also accepts a maximum lot. Minimum volume can push actual risk above the target; the result exposes `actualRiskExceedsTarget` and actual amount/percentage.

Instrument overrides take precedence. Forex falls back to global lot settings; other categories use instrument defaults. Manual instrument valuation is in account currency per lot per movement unit.

## Conversion reliability

`calculateTrade` sets `requireReliablePipValue: true`, rejecting the domain engine's estimated generic pip value. The UI supports USD and EUR accounts and plans conversion from effective specifications.

Frankfurter reference rates include source date and fetch time. Cached rates may be used after refresh failures, with stale status where displayed. EUR/USD requires a successful fetch or an explicitly confirmed manual rate; its initial example is unconfirmed. These are not streaming bid/ask quotes.

## Adjustments

Optional adjustments create a candidate alongside the original. Fixed movement uses the effective movement unit. Signal-relative movement is bounded by stop distance and category caps. Profiles attempt to shift prices, preserve risk, or preserve reward-to-risk. Guards reject candidates that violate price structure or configured risk/reward rules, leaving the original active.

See [adjust-signal.ts](../src/domain/fx/adjust-signal.ts) and its tests for exact policies. Caps are application rules, not broker execution specifications.

## Catalog provenance

The snapshot was captured on **2026-10-07**. Source fields include contracts, currencies, and display precision. The endpoint does **not** supply minimum volume or volume step.

Many volume rules are compatibility defaults. Some use official historical updates; neither establishes current account-specific specifications. Display precision does not prove execution tick size. Read the [capture policy](../src/domain/fx/catalog-source/README.md) and verify settings against your platform.

## Limitations

- Price-distance risk excludes spread, commissions, swaps, slippage, margin requirements, and liquidity.
- Stop-loss input does not guarantee execution at that price.
- Broker contracts and permitted volumes can differ from the snapshot.
- OCR and text parsing require review of extracted values.
- Reference or manual conversion rates can differ from execution-time conversion.
- Calculations use JavaScript floating-point numbers and explicit rounding.
- Saved trades record calculations, not executed orders.

This is a calculation tool, not investment advice or an automated trading system.
