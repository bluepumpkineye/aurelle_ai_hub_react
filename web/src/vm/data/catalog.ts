/**
 * Aurelle SKU catalog — generated deterministically at module load.
 * Mock merchandising data; the real catalog arrives through StoreAdapter
 * (see EXTENSION.md — CMS-driven catalog with brand-approved dimensions).
 */

import { Rng } from "../core/Seed";
import type { ExclusivityTier, ProductCategory, SKU } from "./types";

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  rings: "Rings",
  bracelets: "Bracelets",
  necklaces: "Necklaces",
  "watches-dress": "Watches — Dress",
  "watches-sport": "Watches — Sport",
  earrings: "Earrings",
  brooches: "Brooches",
  "leather-goods": "Small Leather Goods",
  fragrance: "Fragrance",
};

export const CATEGORY_ORDER: ProductCategory[] = [
  "rings",
  "bracelets",
  "necklaces",
  "watches-dress",
  "watches-sport",
  "earrings",
  "brooches",
  "leather-goods",
  "fragrance",
];

const COLLECTIONS: Record<ProductCategory, string[]> = {
  rings: ["Lumière", "Éclat Solitaire", "Rive Nacre"],
  bracelets: ["Maillon d'Or", "Ruban", "Astre"],
  necklaces: ["Cascade", "Perle Noire", "Méridien"],
  "watches-dress": ["Heure Céleste", "Minuit"],
  "watches-sport": ["Régate", "Altitude"],
  earrings: ["Goutte", "Sillage"],
  brooches: ["Volière", "Camélia d'Hiver"],
  "leather-goods": ["Voyage", "Carnet"],
  fragrance: ["Aube", "Oud Impérial"],
};

const PRICE_BANDS: Record<ProductCategory, [number, number]> = {
  rings: [3200, 148000],
  bracelets: [4800, 96000],
  necklaces: [6500, 320000],
  "watches-dress": [12000, 210000],
  "watches-sport": [8500, 74000],
  earrings: [2900, 88000],
  brooches: [5400, 120000],
  "leather-goods": [420, 3800],
  fragrance: [180, 950],
};

const PER_CATEGORY = 14;

function tierFor(rng: Rng): ExclusivityTier {
  const r = rng.next();
  if (r < 0.12) return "exceptional";
  if (r < 0.42) return "high";
  return "standard";
}

const CATEGORY_PREFIXES: Record<ProductCategory, string> = {
  rings: "RI",
  bracelets: "BR",
  necklaces: "NE",
  "watches-dress": "WD",
  "watches-sport": "WS",
  earrings: "EA",
  brooches: "BO",
  "leather-goods": "LE",
  fragrance: "FR",
};

function buildCatalog(): SKU[] {
  const rng = new Rng(0xa07e11e);
  const out: SKU[] = [];
  for (const category of CATEGORY_ORDER) {
    const collections = COLLECTIONS[category];
    const [lo, hi] = PRICE_BANDS[category];
    const prefix = CATEGORY_PREFIXES[category];
    for (let i = 0; i < PER_CATEGORY; i++) {
      const collection = collections[i % collections.length];
      const tier = tierFor(rng);
      const priceScale = tier === "exceptional" ? 1 : tier === "high" ? 0.45 : 0.18;
      const price = Math.round((lo + (hi - lo) * priceScale * rng.range(0.5, 1.4)) / 10) * 10;
      const code = `AU-${prefix}${String(i + 1).padStart(3, "0")}`;
      out.push({
        id: code,
        name: `${collection} ${["I", "II", "III", "IV", "V", "VI", "VII", "VIII"][i % 8]}`,
        category,
        collection,
        tier,
        price: Math.max(price, lo),
        meshSeed: rng.int(1, 0x7fffffff),
      });
    }
  }
  return out;
}

export const SKU_CATALOG: SKU[] = buildCatalog();

export const SKU_BY_ID: Map<string, SKU> = new Map(SKU_CATALOG.map((s) => [s.id, s]));

export function skusForCategory(category: ProductCategory): SKU[] {
  return SKU_CATALOG.filter((s) => s.category === category);
}
