import { randomUUID } from "node:crypto";
import { PricingOverlapException } from "./pricing.errors.js";
import {
  isEffective,
  periodsOverlap,
  resolvePricing,
  targetKey,
} from "./pricing-utils.js";
import type {
  GlobalPricingConfigInput,
  PricingConfigInput,
  PricingConfigRecord,
  PricingRepository,
} from "./pricing.types.js";

export class InMemoryPricingRepository implements PricingRepository {
  private readonly configs: PricingConfigRecord[] = [
    {
      id: randomUUID(),
      scope: "SYSTEM",
      propertyId: null,
      roomId: null,
      tenancyId: null,
      rentAmount: "0",
      electricityUnitPrice: "3500",
      waterUnitPrice: "15000",
      trashFee: "30000",
      internetFee: "100000",
      serviceFee: "0",
      utilityClosingDay: 28,
      dueDay: 5,
      currencyCode: "VND",
      timezone: "Asia/Ho_Chi_Minh",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      isActive: true,
      notes: "test default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  async list() {
    return [...this.configs].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  async findById(id: string) {
    return this.configs.find((config) => config.id === id) ?? null;
  }

  async getGlobal() {
    return (
      [...this.configs]
        .reverse()
        .find((config) => config.scope === "SYSTEM" && config.isActive) ?? null
    );
  }

  async upsertGlobal(input: GlobalPricingConfigInput) {
    const current = await this.getGlobal();
    if (current) {
      Object.assign(current, input, {
        rentAmount: null,
        propertyId: null,
        roomId: null,
        tenancyId: null,
        effectiveTo: null,
        isActive: true,
        updatedAt: new Date().toISOString(),
      });
      this.configs.forEach((config) => {
        if (config.id !== current.id && config.scope === "SYSTEM") {
          config.isActive = false;
        }
      });
      return current;
    }

    const created = await this.create({
      scope: "SYSTEM",
      rentAmount: null,
      ...input,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      isActive: true,
    });
    this.configs.forEach((config) => {
      if (config.id !== created.id && config.scope === "SYSTEM") {
        config.isActive = false;
      }
    });
    return created;
  }

  async create(input: PricingConfigInput) {
    this.assertNoOverlap(input);
    const now = new Date().toISOString();
    const config: PricingConfigRecord = {
      id: randomUUID(),
      scope: input.scope,
      propertyId: input.propertyId ?? null,
      roomId: input.roomId ?? null,
      tenancyId: input.tenancyId ?? null,
      rentAmount: input.rentAmount ?? null,
      electricityUnitPrice: input.electricityUnitPrice ?? null,
      waterUnitPrice: input.waterUnitPrice ?? null,
      trashFee: input.trashFee ?? null,
      internetFee: input.internetFee ?? null,
      serviceFee: input.serviceFee ?? null,
      utilityClosingDay: input.utilityClosingDay ?? null,
      dueDay: input.dueDay ?? null,
      currencyCode: input.currencyCode ?? null,
      timezone: input.timezone ?? null,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      isActive: input.isActive ?? true,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.configs.push(config);
    return config;
  }

  async update(id: string, input: Partial<PricingConfigInput>) {
    const current = this.configs.find((config) => config.id === id);
    if (!current) return null;
    const next = { ...current, ...input };
    this.assertNoOverlap(next, id);
    Object.assign(current, next, { updatedAt: new Date().toISOString() });
    return current;
  }

  async deactivate(id: string) {
    const current = this.configs.find((config) => config.id === id);
    if (!current) return null;
    current.isActive = false;
    current.updatedAt = new Date().toISOString();
    return current;
  }

  async resolve(input: {
    propertyId?: string;
    roomId?: string;
    tenancyId?: string;
    asOf: string;
  }) {
    const candidates = this.configs.filter((config) => {
      if (!isEffective(config, input.asOf)) return false;
      if (config.scope === "SYSTEM") return true;
      if (config.scope === "PROPERTY")
        return config.propertyId === input.propertyId;
      if (config.scope === "ROOM") return config.roomId === input.roomId;
      return config.tenancyId === input.tenancyId;
    });

    return resolvePricing(candidates);
  }

  private assertNoOverlap(
    input: Pick<
      PricingConfigInput,
      | "scope"
      | "propertyId"
      | "roomId"
      | "tenancyId"
      | "effectiveFrom"
      | "effectiveTo"
      | "isActive"
    >,
    excludeId?: string,
  ) {
    if (input.isActive === false) return;
    const key = targetKey(input);
    const exists = this.configs.some(
      (config) =>
        config.id !== excludeId &&
        config.isActive &&
        targetKey(config) === key &&
        periodsOverlap(
          input.effectiveFrom,
          input.effectiveTo,
          config.effectiveFrom,
          config.effectiveTo,
        ),
    );
    if (exists) throw new PricingOverlapException();
  }
}
