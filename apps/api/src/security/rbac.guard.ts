import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { SessionService } from "../auth/session.service.js";
import { IS_PUBLIC_ROUTE } from "./public.decorator.js";
import { AppRole, REQUIRED_ROLES } from "./roles.decorator.js";

interface RequestWithUser extends Request {
  user?: {
    id: string;
    role: AppRole;
    propertyId: string;
  };
}

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const session = await this.sessionService.verifySessionToken(
      request.cookies?.tro_session,
    );
    const user =
      request.user ??
      (session
        ? {
            id: session.userId,
            role: session.role,
            propertyId: session.propertyId,
          }
        : undefined);

    if (!user) {
      throw new UnauthorizedException("Authentication required");
    }

    request.user = user;

    const roles = this.reflector.getAllAndOverride<AppRole[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);

    return !roles?.length || roles.includes(user.role);
  }
}
