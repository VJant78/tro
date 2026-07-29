import { Controller, Get } from "@nestjs/common";
import { Public } from "../security/public.decorator.js";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "tro-api",
      phase: "phase-2-foundation",
    };
  }
}
