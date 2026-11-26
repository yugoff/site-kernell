import "server-only";
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

export function listPricingRules(category?: string): PricingRule[] {
  const sql = db();
  const rows = category
    ? sql
        .prepare(
          "SELECT id,category,provider_key AS providerKey,markup_percent AS markupPercent,fixed_retail_price AS fixedRetailPrice,min_margin_rub AS minMarginRub,enabled,updated_at AS updatedAt FROM pricing_rules WHERE category=? ORDER BY provider_key",
        )
        .all(category)
    : sql
        .prepare(
          "SELECT id,category,provider_key AS providerKey,markup_percent AS markupPercent,fixed_retail_price AS fixedRetailPrice,min_margin_rub AS minMarginRub,enabled,updated_at AS updatedAt FROM pricing_rules ORDER BY category,provider_key",
        )
        .all();

  return rows.map((row) => ({
    ...(row as Omit<PricingRule, "enabled"> & { enabled: number }),
    enabled: Boolean((row as { enabled: number }).enabled),
  }));
}

/**
 * Resolves the most specific enabled rule: (category, providerKey) first,
 * then category default (category, ''), then safe fallback.
 */
export function resolvePricingRule(
  category: string,
  providerKey = "",
): PricingRule {
  const sql = db();
  if (providerKey) {
    const specific = sql
      .prepare(
        "SELECT id,category,provider_key AS providerKey,markup_percent AS markupPercent,fixed_retail_price AS fixedRetailPrice,min_margin_rub AS minMarginRub,enabled,updated_at AS updatedAt FROM pricing_rules WHERE category=? AND provider_key=? AND enabled=1",
      )
      .get(category, providerKey) as
      | (Omit<PricingRule, "enabled"> & { enabled: number })
      | undefined;
    if (specific) {
      return { ...specific, enabled: Boolean(specific.enabled) };
    }
  }

  const categoryDefault = sql
    .prepare(
      "SELECT id,category,provider_key AS providerKey,markup_percent AS markupPercent,fixed_retail_price AS fixedRetailPrice,min_margin_rub AS minMarginRub,enabled,updated_at AS updatedAt FROM pricing_rules WHERE category=? AND provider_key='' AND enabled=1",
    )
    .get(category) as
    | (Omit<PricingRule, "enabled"> & { enabled: number })
    | undefined;

  if (categoryDefault) {
    return { ...categoryDefault, enabled: Boolean(categoryDefault.enabled) };
  }
  return { ...FALLBACK_RULE, category };
}

/**
 * Calculates integer ruble retail price from an upstream provider cost price.
 */
export function calculateRetailPrice(
  costPriceRub: number,
  category: string,
  providerKey = "",
): PricedAmount {
  const safeCost = Math.max(0, Number(costPriceRub) || 0);
  const rule = resolvePricingRule(category, providerKey);
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

