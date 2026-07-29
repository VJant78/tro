import { SetMetadata } from "@nestjs/common";

export const REQUIRED_ROLES = "requiredRoles";

export type AppRole = "OWNER" | "MANAGER" | "STAFF" | "VIEWER";

export const Roles = (...roles: AppRole[]) =>
  SetMetadata(REQUIRED_ROLES, roles);
