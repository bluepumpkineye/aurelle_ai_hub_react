/**
 * Planogram diff engine — given two slot-state maps, produce PlanogramDiff[]
 * (added / removed / changed / moved). Rendered as a 3D overlay:
 * green = new, red = removed, amber = changed, blue = moved.
 */

import type { PlanogramDiff, SlotKey, SlotState } from "../data/types";
import { parseSlotKey } from "../data/types";

function sameState(a: SlotState, b: SlotState): boolean {
  return (
    a.sku === b.sku &&
    a.stockLevel === b.stockLevel &&
    a.campaignFlag === b.campaignFlag &&
    a.exclusivityTier === b.exclusivityTier
  );
}

export function diffPlanograms(
  before: ReadonlyMap<SlotKey, SlotState> | Record<SlotKey, SlotState>,
  after: ReadonlyMap<SlotKey, SlotState> | Record<SlotKey, SlotState>,
): PlanogramDiff[] {
  const b = before instanceof Map ? before : new Map(Object.entries(before));
  const a = after instanceof Map ? after : new Map(Object.entries(after));
  const diffs: PlanogramDiff[] = [];

  // Track SKUs that vanish from one slot and appear in another → "moved".
  const removedBySku = new Map<string, SlotKey[]>();
  const addedBySku = new Map<string, SlotKey[]>();

  const keys = new Set<SlotKey>([...b.keys(), ...a.keys()]);
  for (const key of keys) {
    const sb = b.get(key) ?? null;
    const sa = a.get(key) ?? null;
    const hadSku = sb?.sku != null;
    const hasSku = sa?.sku != null;

    if (hadSku && !hasSku && sb?.sku) {
      const list = removedBySku.get(sb.sku) ?? [];
      list.push(key);
      removedBySku.set(sb.sku, list);
    } else if (!hadSku && hasSku && sa?.sku) {
      const list = addedBySku.get(sa.sku) ?? [];
      list.push(key);
      addedBySku.set(sa.sku, list);
    } else if (sb && sa && !sameState(sb, sa)) {
      diffs.push({ slot: parseSlotKey(key), kind: "changed", before: sb, after: sa });
    }
  }

  // Pair removals with additions of the same SKU as moves.
  for (const [sku, removedKeys] of removedBySku) {
    const addedKeys = addedBySku.get(sku) ?? [];
    while (removedKeys.length && addedKeys.length) {
      const from = removedKeys.shift();
      const to = addedKeys.shift();
      if (from === undefined || to === undefined) break;
      diffs.push({
        slot: parseSlotKey(to),
        kind: "moved",
        before: b.get(from) ?? null,
        after: a.get(to) ?? null,
      });
    }
    for (const k of removedKeys) {
      diffs.push({ slot: parseSlotKey(k), kind: "removed", before: b.get(k) ?? null, after: null });
    }
    if (addedKeys.length) addedBySku.set(sku, addedKeys);
    else addedBySku.delete(sku);
  }
  for (const [, addedKeys] of addedBySku) {
    for (const k of addedKeys) {
      diffs.push({ slot: parseSlotKey(k), kind: "added", before: null, after: a.get(k) ?? null });
    }
  }

  return diffs;
}
