import {
  Injectable,
  Inject,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import type { LoginInput } from "./auth.schemas.js";
import { SessionService } from "./session.service.js";

const devOwner = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "owner@example.local",
  role: "OWNER" as const,
  password: "ChangeMe123!",
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SessionService) private readonly sessionService: SessionService,
  ) {}

  async login(input: LoginInput) {
    if (process.env.NODE_ENV === "production") {
      throw new UnprocessableEntityException(
        "Production auth provider is not configured",
      );
    }

    if (
      input.email !== devOwner.email ||
      input.password !== devOwner.password
    ) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const session = await this.sessionService.createSession({
      userId: devOwner.id,
      role: devOwner.role,
    });

    await this.auditService.record({
      action: "CREATE",
      entityType: "session",
      entityId: session.sessionId,
      actorUserId: devOwner.id,
      metadata: { reason: "dev-login" },
    });

    return {
      ...session,
      user: {
        id: devOwner.id,
        email: devOwner.email,
        role: devOwner.role,
      },
    };
  }
}
