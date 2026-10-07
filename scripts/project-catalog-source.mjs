// Reproduce the runtime projection after deliberately updating the raw capture.
// This is an offline artifact transform; catalog updates are never runtime requests.
import { URL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
const directory = new URL("../src/domain/fx/catalog-source/", import.meta.url);
const snapshot = JSON.parse(await readFile(new URL("symbols-response.json", directory), "utf8"));
const fields = [
  "active",
  "region",
  "code",
  "displayCode",
  "name",
  "assetClass",
  "aliases",
  "contractSize",
  "profitCurrency",
  "marginCurrency",
  "digits",
  "pipConversion",
];
const symbols = snapshot.data.symbols.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
await writeFile(new URL("runtime-symbols.json", directory), JSON.stringify({ data: { symbols } }) + "\n");
