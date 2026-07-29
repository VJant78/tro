import { createPrismaClient } from "../src/index.js";

const prisma = createPrismaClient();

const devOwnerId = "00000000-0000-4000-8000-000000000001";
const devPropertyId = "00000000-0000-4000-8000-000000000002";

async function main() {
  await prisma.user.upsert({
    where: { id: devOwnerId },
    update: {
      email: "owner@example.local",
      fullName: "Development Owner",
      role: "OWNER",
      isActive: true,
    },
    create: {
      id: devOwnerId,
      email: "owner@example.local",
      passwordHash: "dev-only-auth-service-password",
      fullName: "Development Owner",
      role: "OWNER",
      isActive: true,
    },
  });

  await prisma.property.upsert({
    where: {
      ownerUserId_code: {
        ownerUserId: devOwnerId,
        code: "DEFAULT",
      },
    },
    update: {
      id: devPropertyId,
      name: "Default Property",
      deletedAt: null,
    },
    create: {
      id: devPropertyId,
      ownerUserId: devOwnerId,
      code: "DEFAULT",
      name: "Default Property",
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: "timezone" },
    update: { value: "Asia/Ho_Chi_Minh" },
    create: {
      key: "timezone",
      value: "Asia/Ho_Chi_Minh",
      valueType: "string",
      description: "System timezone used for billing periods.",
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: "currency_code" },
    update: { value: "VND" },
    create: {
      key: "currency_code",
      value: "VND",
      valueType: "string",
      description: "Default currency code for invoices and payments.",
    },
  });

  const pricingDefaults = [
    [
      "default_rent_amount",
      "0",
      "Default rent fallback when no room or tenancy price exists.",
    ],
    ["electricity_unit_price", "3500", "Default electricity unit price."],
    ["water_unit_price", "15000", "Default water unit price."],
    ["trash_fee", "30000", "Default monthly trash fee."],
    ["internet_fee", "100000", "Default monthly internet fee."],
    ["service_fee", "0", "Default monthly service fee."],
  ] as const;

  for (const [key, value, description] of pricingDefaults) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: {
        key,
        value,
        valueType: "money",
        description,
      },
    });
  }

  const existingSystemPricing = await prisma.pricingConfig.findFirst({
    where: { scope: "SYSTEM", deletedAt: null, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  if (existingSystemPricing) {
    const saved = await prisma.pricingConfig.update({
      where: { id: existingSystemPricing.id },
      data: {
        scope: "SYSTEM",
        rentAmount: null,
        electricityUnitPrice: "3500",
        waterUnitPrice: "15000",
        trashFee: "30000",
        internetFee: "100000",
        serviceFee: "0",
        utilityClosingDay: 28,
        dueDay: 5,
        currencyCode: "VND",
        timezone: "Asia/Ho_Chi_Minh",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        notes: "Default system pricing seed.",
      },
    });
    await prisma.pricingConfig.updateMany({
      where: {
        scope: "SYSTEM",
        isActive: true,
        deletedAt: null,
        id: { not: saved.id },
      },
      data: { isActive: false },
    });
  } else {
    const saved = await prisma.pricingConfig.create({
      data: {
        scope: "SYSTEM",
        rentAmount: null,
        electricityUnitPrice: "3500",
        waterUnitPrice: "15000",
        trashFee: "30000",
        internetFee: "100000",
        serviceFee: "0",
        utilityClosingDay: 28,
        dueDay: 5,
        currencyCode: "VND",
        timezone: "Asia/Ho_Chi_Minh",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        notes: "Default system pricing seed.",
      },
    });
    await prisma.pricingConfig.updateMany({
      where: {
        scope: "SYSTEM",
        isActive: true,
        deletedAt: null,
        id: { not: saved.id },
      },
      data: { isActive: false },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
