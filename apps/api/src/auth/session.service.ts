import { randomBytes, randomUUID, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { Injectable } from "@nestjs/common";
import type { AppRole } from "../security/roles.decorator.js";
import { DEFAULT_PROPERTY_ID } from "../platform/property-scope.js";

const scrypt = promisify(scryptCallback);

@Injectable()
export class SessionService {
  private readonly sessions = new Map<
    string,
    {
      sessionId: string;
      tokenHash: string;
      userId: string;
      role: AppRole;
      propertyId: string;
      expiresAt: string;
    }
  >();

  async createSession(input: {
    userId: string;
    role: AppRole;
    propertyId?: string;
  }) {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = await this.hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();
    const session = {
      sessionId: randomUUID(),
      tokenHash,
      userId: input.userId,
      role: input.role,
      propertyId: input.propertyId ?? DEFAULT_PROPERTY_ID,
      expiresAt,
    };

    this.sessions.set(tokenHash, session);
    return {
      ...session,
      sessionToken: rawToken,
    };
  }

  async verifySessionToken(token?: string) {
    if (!token) return undefined;

    const tokenHash = await this.hashSessionToken(token);
    const session = this.sessions.get(tokenHash);
    if (!session) return undefined;

    if (Date.parse(session.expiresAt) <= Date.now()) {
      this.sessions.delete(tokenHash);
      return undefined;
    }

    return session;
  }

  async revokeSessionToken(token?: string) {
    if (!token) return undefined;
    const tokenHash = await this.hashSessionToken(token);
    const session = this.sessions.get(tokenHash);
    this.sessions.delete(tokenHash);
    return session;
  }

  async hashSessionToken(token: string) {
    const salt = process.env.SESSION_SECRET ?? "phase2-local-session-secret";
    const derived = (await scrypt(token, salt, 64)) as Buffer;
    return derived.toString("base64url");
  }
}
