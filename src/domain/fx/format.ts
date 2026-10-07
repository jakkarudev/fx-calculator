/** Decimal precision of a numeric increment, including scientific notation. */
export function getDecimalPlaces(value: number | string) {
  const [coefficient, exponentText] = String(value).toLowerCase().split("e");
  const fractionDigits = coefficient.split(".")[1]?.length ?? 0;
  return Math.min(100, Math.max(0, fractionDigits - Number(exponentText ?? 0)));
}

export function formatNumber(value: number, fractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function getFractionDigits(sourceText?: string) {
  if (!sourceText) return null;

  const match = sourceText.trim().match(/^-?\d+(?:\.(\d+))?$/);
  return match?.[1]?.length ?? 0;
}

export function formatPrice(value: number, sourceText?: string) {
  const fractionDigits = getFractionDigits(sourceText);
  if (fractionDigits !== null) {
    return value.toFixed(fractionDigits);
  }

  return value.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatLot(value: number, step = 0.01) {
  if (!Number.isFinite(value)) return String(value);

  // Preserve the number's shortest decimal representation; the step only adds padding.
  // Expanding scientific notation avoids toFixed's precision limit and zeroing tiny lots.
  const [coefficient, exponentText] = String(Math.abs(value)).split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = whole + fraction;
  const decimalPosition = whole.length + Number(exponentText ?? 0);
  let decimalText: string;
  if (decimalPosition <= 0) {
    decimalText = `0.${"0".repeat(-decimalPosition)}${digits}`;
  } else if (decimalPosition >= digits.length) {
    decimalText = digits + "0".repeat(decimalPosition - digits.length);
  } else {
    decimalText = `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
  }

  const [integer, decimals = ""] = decimalText.split(".");
  const paddedDecimals = decimals.padEnd(getDecimalPlaces(step), "0");
  return `${value < 0 ? "-" : ""}${integer}${paddedDecimals ? `.${paddedDecimals}` : ""}`;
}
