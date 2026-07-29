export type PricingScope = "SYSTEM" | "PROPERTY" | "ROOM" | "TENANCY";

export interface PricingConfigRecord {
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
  createdAt: string;
  updatedAt: string;
}

export type PricingField =
  | "rentAmount"
  | "electricityUnitPrice"
  | "waterUnitPrice"
  | "trashFee"
  | "internetFee"
  | "serviceFee"
  | "utilityClosingDay"
  | "dueDay"
  | "currencyCode"
  | "timezone";

export type ResolvedPricing = Record<PricingField, string | number | null>;

export interface PricingRepository {
  list(): Promise<PricingConfigRecord[]>;
  findById(id: string): Promise<PricingConfigRecord | null>;
  getGlobal(): Promise<PricingConfigRecord | null>;
  upsertGlobal(input: GlobalPricingConfigInput): Promise<PricingConfigRecord>;
  create(input: PricingConfigInput): Promise<PricingConfigRecord>;
  update(
    id: string,
    input: Partial<PricingConfigInput>,
  ): Promise<PricingConfigRecord | null>;
  deactivate(id: string): Promise<PricingConfigRecord | null>;
  resolve(input: {
    propertyId?: string;
    roomId?: string;
    tenancyId?: string;
    asOf: string;
  }): Promise<{
    resolvedConfig: ResolvedPricing;
    sources: Record<PricingField, PricingScope | null>;
  }>;
}

export interface PricingConfigInput {
  scope: PricingScope;
  propertyId?: string | null;
  roomId?: string | null;
  tenancyId?: string | null;
  rentAmount?: string | null;
  electricityUnitPrice?: string | null;
  waterUnitPrice?: string | null;
  trashFee?: string | null;
  internetFee?: string | null;
  serviceFee?: string | null;
  utilityClosingDay?: number | null;
  dueDay?: number | null;
  currencyCode?: string | null;
  timezone?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

export type GlobalPricingConfigInput = Pick<
  PricingConfigInput,
  | "electricityUnitPrice"
  | "waterUnitPrice"
  | "trashFee"
  | "internetFee"
  | "serviceFee"
  | "utilityClosingDay"
  | "dueDay"
  | "currencyCode"
  | "timezone"
  | "notes"
>;
