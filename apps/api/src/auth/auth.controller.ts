import { Body, Controller, Get, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { Public } from "../security/public.decorator.js";
import { parseRequest } from "../platform/validation.js";
import { AuthService } from "./auth.service.js";
import { loginSchema } from "./auth.schemas.js";
import type { AppRole } from "../security/roles.decorator.js";

interface AuthenticatedRequest extends Request {
  user?: { id: string; role: AppRole };
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = parseRequest(loginSchema, body);
    const session = await this.authService.login(input);

    response.cookie("tro_session", session.sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    return {
      user: session.user,
      expiresAt: session.expiresAt,
    };
  }

  @Post("logout")
  @Public()
  async logout(
    @Req() request: Request & { user?: { id: string } },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.logout(
      request.cookies?.tro_session,
      request.user?.id,
    );
    response.clearCookie("tro_session", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return result;
  }

  @Get("me")
  me(@Req() request: AuthenticatedRequest) {
    return {
      id: request.user?.id,
      role: request.user?.role,
    };
  }

  @Public()
  @Get("session-policy")
  getSessionPolicy() {
    return {
      cookieName: "tro_session",
      httpOnly: true,
      sameSite: "lax",
      secureInProduction: true,
      denyByDefault: true,
    };
  }
}
