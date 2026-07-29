import { Body, Controller, Get, Inject, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../security/public.decorator.js";
import { parseRequest } from "../platform/validation.js";
import { AuthService } from "./auth.service.js";
import { loginSchema } from "./auth.schemas.js";

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
