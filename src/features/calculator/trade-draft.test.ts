import { describe, expect, it } from "vitest";
import { emptyTradeDraft, restoreDraft, serializeDraft } from "./trade-draft";

const rawSignal = "WTI BUY\nENTRY 80\nSL 78\nTP 84";

describe("stored trade drafts", () => {
  it("migrates legacy corrected prices and source text to Import without reparsing corrections", () => {
    const draft = restoreDraft(
      JSON.stringify({
        rawSignal,
        parsed: {
          pair: "USOIL.cash",
          side: "buy",
          orderType: "market",
          entry: 81,
          stopLoss: 79,
          takeProfit: 85,
          priceText: { entry: "81.00", stopLoss: "79.00", takeProfit: "85.00" },
        },
      }),
    );
    expect(draft).toMatchObject({
      mode: "import",
      rawSignal,
      importedSource: rawSignal,
      manualDraft: { ...emptyTradeDraft, side: "auto" },
      importDraft: { pair: "USOIL.cash", entry: "81.00", stopLoss: "79.00", takeProfit: "85.00" },
    });
  });

  it("reparses legacy source when the saved parsed signal is unusable", () => {
    expect(restoreDraft(JSON.stringify({ rawSignal, parsed: null }))?.importDraft).toMatchObject({
      pair: "USOIL.cash",
      entry: "80",
      stopLoss: "78",
      takeProfit: "84",
    });
    expect(restoreDraft(JSON.stringify({ rawSignal: "unreadable", parsed: null }))).toMatchObject({
      mode: "import",
      rawSignal: "unreadable",
      importedSource: "unreadable",
      importDraft: null,
      parseError: expect.any(String),
    });
  });

  it("preserves independent incomplete Manual and corrected Import drafts across versioned storage", () => {
    const state = {
      mode: "manual" as const,
      manualDraft: { ...emptyTradeDraft, side: "auto", entry: "1.", stopLoss: "", takeProfit: "invalid" },
      importDraft: {
        ...emptyTradeDraft,
        pair: "US100",
        entry: "200.00",
        stopLoss: "195",
        takeProfit: "210",
        priceText: { entry: "200.00" },
      },
      rawSignal: "edited source",
      importedSource: "original source",
    };
    expect(restoreDraft(serializeDraft(state))).toMatchObject(state);
  });

  it("normalizes a stored Manual alias and restores versioned defaults safely", () => {
    expect(
      restoreDraft(
        JSON.stringify({
          version: 2,
          mode: "import",
          rawSignal,
          manualDraft: { ...emptyTradeDraft, pair: "NAS100" },
          importDraft: { entry: 200 },
        }),
      ),
    ).toMatchObject({
      mode: "import",
      manualDraft: { pair: "US100" },
      importDraft: null,
      rawSignal,
      importedSource: rawSignal,
    });
    expect(restoreDraft(JSON.stringify({ version: 2 }))).toMatchObject({
      mode: "manual",
      manualDraft: { ...emptyTradeDraft, side: "auto" },
      importDraft: null,
      rawSignal: "",
      importedSource: "",
    });
  });

  it.each([null, "{", "null", "[]", '{"version":3,"rawSignal":"text"}'])(
    "ignores unsupported or malformed storage %s",
    (stored) => expect(restoreDraft(stored)).toBeNull(),
  );
});
