import { DomainException } from "./domain.exception.js";
import { getAuthorizedPropertyId } from "./request-context.js";

export const DEFAULT_PROPERTY_ID = "00000000-0000-4000-8000-000000000002";

export function authorizedPropertyId() {
  return getAuthorizedPropertyId() ?? DEFAULT_PROPERTY_ID;
}

export function assertAuthorizedPropertyId(propertyId: string) {
  if (propertyId !== authorizedPropertyId()) {
    throw new DomainException(
      "PROPERTY_SCOPE_FORBIDDEN",
      "Resource does not belong to the authorized property",
      403,
    );
  }
}
