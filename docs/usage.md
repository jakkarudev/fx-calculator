# Usage guide

## Set up your account

Open Settings and set the account balance, risk percentage, and account currency (USD or EUR). The initial account is a $1,000 example with 1% risk; replace it with your intended inputs.

Forex uses the global lot step and minimum lot unless an instrument override is present. Other instrument categories use their own defaults. Overrides can specify lot step, minimum lot, contract size, movement unit, and manual value per lot per movement unit in account currency. Confirm the active rules shown by the calculator against your platform.

When conversion is necessary, the app fetches reference exchange rates. EUR/USD also supports an explicitly entered manual rate. The untouched initial EUR/USD example does not count as a confirmed rate. A manual pip value can supply valuation when an appropriate conversion is unavailable.

## Enter a Manual trade

1. Select **Manual** and search for an instrument by symbol or name.
2. Choose **Long**, **Short**, or **Auto**. Auto requires stop loss and take profit on opposite, consistent sides of entry.
3. Enter entry, stop loss, and take profit.
4. Select **Calculate**. If a needed rate is still loading, the calculation waits for that conversion.
5. Review lot size, actual risk, and reward-to-risk before copying a value.

Changing inputs requires a new Manual calculation. Changing the instrument clears its prices so values from the previous asset are not carried across.

## Import a signal

Select **Import**, paste a signal, and choose **Parse signal**, or use **Paste clipboard**. A simple supported example is:

```text
EURUSD BUY
Entry: 1.08450
SL: 1.08050
TP: 1.09250
```

Review the extracted instrument, direction, and prices in the editable form. Corrections are part of the workflow. Unsupported instrument declarations are rejected rather than silently sized as a generic forex contract.

In the Android app, **Read screenshot** lets you select an image for on-device text recognition. Screenshot recognition is unavailable in the browser. If an image cannot be read, paste or enter the trade instead.

## Review results

The result includes rounded lot size, stop and reward distances, reward-to-risk ratio, and actual risk. The minimum lot can force risk above your requested target; check the warning and actual risk rather than assuming the percentage target was met.

If a reliable valuation is unavailable, the UI blocks the result. Confirm a conversion rate or configure a valid manual value.

## Optional adjustments

Price adjustments are disabled by default and enabled separately for Manual and Import. Settings offer fixed or signal-relative movement, strength, a shift/keep-risk/keep-rr profile, and a risk buffer. Original and adjusted results remain available for comparison. A rejected candidate falls back to the original result with a rejection reason. These are calculation alternatives, not market predictions.

## Copy and saved trades

Copy result values into your trading platform using the copy controls. Copying a result saves that calculation in local history. Calculating alone does not save a trade.

History retains up to 50 entries and displays them in pages of 20. Selecting an entry opens its saved details, including its Manual or imported origin. History is a record of calculations, not executed orders or performance, and is not synchronized between devices.

Settings and drafts are restored locally. Clearing browser site data or Android app storage removes that device's saved data; there is no cloud backup. See [Privacy](privacy.md).
