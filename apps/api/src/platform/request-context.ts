import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  requestId: string;
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
