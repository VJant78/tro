import { z } from "zod";

export const runtimeEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:4000"),
  SESSION_SECRET: z.string().min(32).optional(),
  SYSTEM_TIMEZONE: z.string().default("Asia/Ho_Chi_Minh"),
  DEFAULT_CURRENCY: z.string().length(3).default("VND"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

export function parseRuntimeEnv(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeEnv {
  return runtimeEnvSchema.parse(env);
}

export const phase2Defaults = {
  apiPrefix: "/api/v1",
  healthPath: "/api/v1/health",
  defaultCurrency: "VND",
  defaultTimezone: "Asia/Ho_Chi_Minh",
} as const;
