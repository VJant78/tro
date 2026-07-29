import { describe, expect, it } from "vitest";
import { parseRuntimeEnv } from "./index.js";

describe("parseRuntimeEnv", () => {
  it("applies safe defaults for local development", () => {
    const env = parseRuntimeEnv({});

    expect(env.NODE_ENV).toBe("development");
    expect(env.SYSTEM_TIMEZONE).toBe("Asia/Ho_Chi_Minh");
    expect(env.DEFAULT_CURRENCY).toBe("VND");
  });
});
