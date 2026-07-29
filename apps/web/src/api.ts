export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const error = parseApiError(payload);
    throw new ApiError(error.message, response.status, error.details);
  }

  return payload as T;
}

function parseApiError(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null
  ) {
    const error = payload.error as {
      message?: unknown;
      details?: unknown;
    };

    return {
      message:
        typeof error.message === "string" ? error.message : "Request failed",
      details: Array.isArray(error.details)
        ? (error.details as Array<{ field: string; message: string }>)
        : undefined,
    };
  }

  return { message: "Request failed", details: undefined };
}
