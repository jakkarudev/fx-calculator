# Crypto sizing fixtures and adjustment policy

The invented numerical examples in `src/domain/fx/crypto.test.ts` and
`src/App.crypto.test.tsx` are dedicated to the public domain under CC0 1.0.
They are arithmetic fixtures, not market quotes or broker recommendations.
Contract sizes come from the committed FTMO capture; the examples and expected
values are calculated independently of the application's sizing functions.

For a $10,000 account risking 1%, the target risk is $100. Loss per lot is
absolute entry-to-stop distance multiplied by contract size. Divide target risk
by loss per lot and floor to the compatibility lot step of 0.01. Multiply the
rounded lots by loss per lot to obtain actual risk. Each example's reward
distance is twice its stop distance, so actual reward is twice actual risk.

| Contract | Entry / SL / TP | Units per lot | USD loss per lot | USD lots / actual risk | EUR lots / actual risk at EURUSD 1.25 |
| --- | --- | --- | --- | --- | --- |
| BTCUSD | 60000 / 58800 / 62400 | 1 | 1200 | 0.08 / 96 | 0.10 / 96 |
| ETHUSD | 3000 / 2920 / 3160 | 10 | 800 | 0.12 / 96 | 0.15 / 96 |
| DOGEUSD | 0.15000 / 0.14300 / 0.16400 | 100000 | 700 | 0.14 / 98 | 0.17 / 95.2 |
| GALUSD | 0.02500 / 0.02100 / 0.03300 | 1000000 | 4000 | 0.02 / 80 | 0.03 / 96 |

For EUR accounts the target is EUR100, and USD loss per lot is divided by 1.25
before rounding lots. No crypto-to-account base conversion is needed: every
active captured crypto contract has USD profit currency. Unsupported account
conversions still require a reliable rate or manual pip value. GALUSD at a
$1,000 balance clamps to 0.01 lots and risks $40 (4%): the app reports excess
risk and rejects an adjustment that exceeds the existing risk guard.

## Application adjustment policy

These are application defaults, not FTMO contract specifications. Crypto keeps
the source movement unit of 1 and the source price digits. For subtle, normal,
and strong adjustments respectively, movement is capped at 2%, 3.5%, or 5% of
the original stop distance and 0.05%, 0.1%, or 0.2% of entry. Both fixed and
signal-relative modes use these bounds. A configured fixed pip amount retains
its movement-unit meaning but acts as an upper bound. Floor to the source
price precision before constructing candidates, then retain the existing risk,
reward-to-risk, distinct-price, and directional-structure guards. Movements
smaller than that price quantum safely retain the original result.

Normal fixed defaults shift BTC's example by USD1 and GALUSD by USD0.00002.
Normal relative defaults shift BTC by USD42 and GALUSD by USD0.00002. Original
price text, including trailing zeros, remains available in results/history;
adjusted price text represents the actual rounded prices when copied.

Every canonical crypto symbol also accepts its USD slash form and the existing
allowlisted broker decorations. The curated AVAXUSD and GALAUSD aliases map to
FTMO's AVAUSD and GALUSD. Unknown decorations and arbitrary ticker substrings
remain unsupported. Lot step/minimum 0.01 remain compatibility defaults, not
verified FTMO platform constraints; instrument overrides still apply.
