import type { EntryKind, SizedEntry } from "./report";

const GB = 1_000_000_000n;
const MAX_BYTES = 18_446_744_073_709_551_615n;
export type MinimumSize = { bytes: bigint; error: null } | { bytes: null; error: string };
export function parseMinimumGb(raw: string): MinimumSize {
  const value = raw.trim();
  if (!value) return { bytes: 0n, error: null };
  if (!/^\d+(?:[.,]\d{1,9})?$/.test(value)) return { bytes: null, error: "0 veya daha büyük bir GB değeri gir. Örnek: 5 veya 0,5." };
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const bytes = BigInt(whole) * GB + BigInt(fraction.padEnd(9, "0"));
  if (bytes > MAX_BYTES) return { bytes: null, error: "Bu boyut desteklenen aralığın üzerinde." };
  return { bytes, error: null };
}

export function filterSizeEntries(entries: SizedEntry[], minimum: bigint, query: string, kind: EntryKind): SizedEntry[] {
  const search = query.trim().toLocaleLowerCase("tr");
  return entries.filter((entry) => entry.kind === kind && BigInt(entry.logicalBytes) >= minimum
    && (!search || entry.path.toLocaleLowerCase("tr").includes(search)));
}

// An omitted item can matter only up to the smallest retained size. Above that
// cutoff, all matches are retained; equal-size ties can still be omitted.
export function sizeListIncomplete(entries: SizedEntry[], kind: EntryKind, truncated: boolean, minimum: bigint): boolean {
  if (!truncated) return false;
  const sameKind = entries.filter((entry) => entry.kind === kind);
  if (!sameKind.length) return true;
  return sameKind.every((entry) => BigInt(entry.logicalBytes) >= minimum);
}
