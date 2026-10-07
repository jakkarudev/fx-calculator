# Position Sizing

The language of trade inputs and position sizing in FX Calculator.

## Language

**Manual trade**:
A trade whose instrument, direction, entry, stop loss, and take profit are supplied directly by the user.

**Imported signal**:
A trade extracted from pasted text or a screenshot. Its extracted values can be corrected by the user.

**Long**:
A buy trade, with stop loss below entry and take profit above entry.

**Short**:
A sell trade, with stop loss above entry and take profit below entry.

**Auto direction**:
A direction choice inferred from entry, stop loss, and take profit together. It resolves to Long when stop loss is below entry and take profit above it, or Short when the positions are reversed; contradictory prices have no valid direction.

**Instrument**:
A tradable asset identified by a symbol, including forex pairs, metals, indices, commodities, crypto, and equities.
_Avoid_: Pair when referring to assets beyond forex.

**Saved trade**:
A calculated trade retained in history when one of its result values is copied.

**Trade origin**:
Whether a trade was entered manually or imported from text or a screenshot.
