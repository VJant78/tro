import type {
  PricingConfigInput,
  PricingConfigRecord,
  PricingField,
  PricingScope,
  ResolvedPricing,
} from "./pricing.types.js";

export const pricingFields: PricingField[] = [
  "rentAmount",
  "electricityUnitPrice",
  "waterUnitPrice",
  "trashFee",
  "internetFee",
  "serviceFee",
  "utilityClosingDay",
  "dueDay",
  "currencyCode",
  "timezone",
];

export const emptyResolvedPricing: ResolvedPricing = {
  rentAmount: null,
  electricityUnitPrice: null,
  waterUnitPrice: null,
  trashFee: null,
  internetFee: null,
  serviceFee: null,
  utilityClosingDay: null,
  dueDay: null,
  currencyCode: null,
  timezone: null,
};

export const scopePriority: PricingScope[] = [
  "SYSTEM",
  "PROPERTY",
  "ROOM",
  "TENANCY",
];

export function targetKey(
  input: Pick<
    PricingConfigInput,
    "scope" | "propertyId" | "roomId" | "tenancyId"
  >,
) {
  if (input.scope === "SYSTEM") return "SYSTEM";
  if (input.scope === "PROPERTY") return `PROPERTY:${input.propertyId}`;
  if (input.scope === "ROOM") return `ROOM:${input.roomId}`;
  return `TENANCY:${input.tenancyId}`;
}

export function periodsOverlap(
  leftFrom: string,
  leftTo: string | null | undefined,
  rightFrom: string,
  rightTo: string | null | undefined,
) {
  const leftEnd = leftTo ?? "9999-12-31";
  const rightEnd = rightTo ?? "9999-12-31";
  return leftFrom < rightEnd && rightFrom < leftEnd;
}

export function isEffective(config: PricingConfigRecord, asOf: string) {
  return (
    config.isActive &&
    config.effectiveFrom <= asOf &&
    (!config.effectiveTo || config.effectiveTo > asOf)
  );
}

export function resolvePricing(configs: PricingConfigRecord[]) {
  const resolvedConfig = { ...emptyResolvedPricing };
  const sources = Object.fromEntries(
    pricingFields.map((field) => [field, null]),
  ) as Record<PricingField, PricingScope | null>;

  for (const scope of scopePriority) {
    const config = configs.find((item) => item.scope === scope);
    if (!config) continue;
    for (const field of pricingFields) {
      const value = config[field];
      if (value !== null && value !== undefined) {
        resolvedConfig[field] = value;
        sources[field] = scope;
      }
    }
  }

  return { resolvedConfig, sources };
}
