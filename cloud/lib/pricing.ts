import "server-only";
import { cloudSetting } from "./settings";
import { db } from "./database";

export type PricingRule = {
  id: string;
  category: string;
  providerKey: string;
  markupPercent: number;
  fixedRetailPrice: number | null;
  minMarginRub: number;
  enabled: boolean;
  updatedAt: number;
};

export type PricedAmount = {
  costPrice: number;
  retailPrice: number;
  margin: number;
  markupPercent: number;
};

const FALLBACK_RULE: PricingRule = {
  id: "fallback",
  category: "default",
  providerKey: "",
  markupPercent: 20,
  fixedRetailPrice: null,
  minMarginRub: 0,
  enabled: true,
  updatedAt: 0,
};

export async function listPricingRules(category?: string): Promise<PricingRule[]> {
  const sql = db();
  const rows = category
    ? await sql
        .prepare(
          "SELECT id,category,provider_key AS providerKey,markup_percent AS markupPercent,fixed_retail_price AS fixedRetailPrice,min_margin_rub AS minMarginRub,enabled,updated_at AS updatedAt FROM pricing_rules WHERE category=? ORDER BY provider_key",
        )
        .all(category)
    : await sql
        .prepare(
          "SELECT id,category,provider_key AS providerKey,markup_percent AS markupPercent,fixed_retail_price AS fixedRetailPrice,min_margin_rub AS minMarginRub,enabled,updated_at AS updatedAt FROM pricing_rules ORDER BY category,provider_key",
        )
        .all();

  return rows.map((row) => ({
    ...(row as Omit<PricingRule, "enabled"> & { enabled: number }),
    enabled: Boolean((row as { enabled: number }).enabled),
  }));
}

/** Load each category in a single D1 read even for catalogs with hundreds of items. */
export async function loadPriceCalculator(category: string) {
  const rules = new Map((await listPricingRules(category))
    .filter((rule) => rule.enabled)
    .map((rule) => [rule.providerKey, rule]));
  const configuredMarkup = Number(cloudSetting("CLOUD_DEFAULT_MARKUP_PERCENT"));
  const fallback = Number.isFinite(configuredMarkup) && configuredMarkup >= 0 && configuredMarkup <= 500
    ? { ...FALLBACK_RULE, markupPercent: configuredMarkup }
    : FALLBACK_RULE;
  return (cost: number, providerKey = "") =>
    priceWithRule(cost, rules.get(providerKey) ?? rules.get("") ?? fallback);
}

export async function calculateRetailPrice(
  cost: number,
  category: string,
  providerKey = "",
) {
  const price = await loadPriceCalculator(category);
  return price(cost, providerKey);
}

function priceWithRule(cost: number, rule: PricingRule): PricedAmount {
  const safeCost = Math.max(0, Number(cost) || 0);
  if (rule.fixedRetailPrice !== null && rule.fixedRetailPrice > 0) {
    const retailPrice = Math.round(rule.fixedRetailPrice);
    const margin = Math.max(0, retailPrice - safeCost);
    const markupPercent =
      safeCost > 0 ? Math.round((margin / safeCost) * 1000) / 10 : 0;
    return { costPrice: safeCost, retailPrice, margin, markupPercent };
  }

  const byPercent = Math.ceil(safeCost * (1 + rule.markupPercent / 100));
  const byMargin = Math.ceil(safeCost + rule.minMarginRub);
  const retailPrice = Math.max(byPercent, byMargin);
  return {
    costPrice: safeCost,
    retailPrice,
    margin: Math.max(0, retailPrice - safeCost),
    markupPercent: rule.markupPercent,
  };
}

