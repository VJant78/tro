import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  requestId: string;
  propertyId?: string;
  ipAddress?: string;
  userAgent?: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
) {
  return requestContext.run(context, callback);
}

export function getRequestId() {
  return requestContext.getStore()?.requestId ?? "unknown";
}

export function getAuthorizedPropertyId() {
  return requestContext.getStore()?.propertyId;
}

export function getAuditRequestContext() {
  const context = requestContext.getStore();
  return {
    requestId: context?.requestId ?? "unknown",
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent,
  };
}
