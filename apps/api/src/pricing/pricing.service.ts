import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { PricingConfigNotFoundException } from "./pricing.errors.js";
import { PRICING_REPOSITORY } from "./pricing.tokens.js";
import type {
  GlobalPricingConfigInput,
  PricingConfigInput,
  PricingRepository,
} from "./pricing.types.js";

@Injectable()
export class PricingService {
  constructor(
    @Inject(PRICING_REPOSITORY) private readonly pricing: PricingRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list() {
    return this.pricing.list();
  }

  effective(input: {
    propertyId?: string;
    roomId?: string;
    tenancyId?: string;
    asOf: string;
  }) {
    return this.pricing.resolve(input);
  }

  global() {
    return this.pricing.getGlobal();
  }

  async updateGlobal(input: GlobalPricingConfigInput, actorUserId?: string) {
    const before = await this.pricing.getGlobal();
    const config = await this.pricing.upsertGlobal(input);
    await this.audit.record({
      action: "CHANGE_PRICING",
      entityType: "pricing_config",
      entityId: config.id,
      actorUserId,
      oldValues: before ?? undefined,
      newValues: config,
      metadata: { scope: "SYSTEM", mode: "single-global-config" },
    });
    return config;
  }

  async create(input: PricingConfigInput, actorUserId?: string) {
    const config = await this.pricing.create(input);
    await this.audit.record({
      action: "CHANGE_PRICING",
      entityType: "pricing_config",
      entityId: config.id,
      actorUserId,
      newValues: config,
    });
    return config;
  }

  async update(
    id: string,
    input: Partial<PricingConfigInput>,
    actorUserId?: string,
  ) {
    const before = await this.pricing.findById(id);
    const config = await this.pricing.update(id, input);
    if (!config) throw new PricingConfigNotFoundException();
    await this.audit.record({
      action: "CHANGE_PRICING",
      entityType: "pricing_config",
      entityId: config.id,
      actorUserId,
      oldValues: before ?? undefined,
      newValues: config,
    });
    return config;
  }

  async deactivate(id: string, actorUserId?: string) {
    const before = await this.pricing.findById(id);
    const config = await this.pricing.deactivate(id);
    if (!config) throw new PricingConfigNotFoundException();
    await this.audit.record({
      action: "CHANGE_PRICING",
      entityType: "pricing_config",
      entityId: config.id,
      actorUserId,
      oldValues: before ?? undefined,
      newValues: config,
      metadata: { mode: "deactivate" },
    });
    return config;
  }
}
