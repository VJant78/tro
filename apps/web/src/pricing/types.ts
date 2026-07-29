export type PricingScope = "SYSTEM" | "PROPERTY" | "ROOM" | "TENANCY";

export interface PricingConfig {
  id: string;
  scope: PricingScope;
  propertyId: string | null;
  roomId: string | null;
  tenancyId: string | null;
  rentAmount: string | null;
  electricityUnitPrice: string | null;
  waterUnitPrice: string | null;
  trashFee: string | null;
  internetFee: string | null;
  serviceFee: string | null;
  utilityClosingDay: number | null;
  dueDay: number | null;
  currencyCode: string | null;
  timezone: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  notes: string | null;
}

export interface EffectivePricingResponse {
  resolvedConfig: Record<string, string | number | null>;
  sources: Record<string, PricingScope | null>;
}
