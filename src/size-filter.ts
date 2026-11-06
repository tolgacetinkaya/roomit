const GB = 1_000_000_000n;
const MAX_BYTES = 18_446_744_073_709_551_615n;
export type MinimumSize = { bytes: bigint; error: null } | { bytes: null; error: string };
export function parseMinimumGb(raw: string): MinimumSize {
  const value = raw.trim();
  if (!value) return { bytes: 0n, error: null };
  if (!/^\d+(?:[.,]\d{1,9})?$/.test(value)) return { bytes: null, error: "Enter a GB value of 0 or greater. For example: 5 or 0.5." };
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const bytes = BigInt(whole) * GB + BigInt(fraction.padEnd(9, "0"));
  if (bytes > MAX_BYTES) return { bytes: null, error: "This size exceeds the supported range." };
  return { bytes, error: null };
}
