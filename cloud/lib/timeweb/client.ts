import "server-only";
import { setTimeout as delay } from "node:timers/promises";
import type { TimewebErrorPayload } from "./types";

function timewebBaseUrl(): string {
  return (process.env.TIMEWEB_API_URL?.trim() || "https://api.timeweb.cloud")
    .replace(/\/$/, "");
}
// Timeweb Public API enforces 20 req/s per endpoint; keep a conservative headroom.
const ENDPOINT_MAX_RPS = 16;
const ENDPOINT_WINDOW_MS = 1000;
const endpointBuckets = new Map<string, number[]>();

/**
 * Typed error returned when an upstream Timeweb Cloud API request fails.
 */
export class TimewebApiError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    public responseId: string | null,
    public endpoint: string,
    message: string,
  ) {
    super(message);
    this.name = "TimewebApiError";
  }
}

export function timewebToken(): string | null {
  const token = process.env.TIMEWEB_TOKEN?.trim();
  return token ? token : null;
}

function normalizeBucket(path: string): string {
  const pathname = path.split("?")[0] || "/";
  return pathname
    .replace(/\/check-domain\/[^/]+$/, "/check-domain/:fqdn")
    .replace(/\/[0-9a-f-]{8,}(?=\/|$)/gi, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
}

async function paceEndpoint(path: string) {
  const bucketKey = normalizeBucket(path);
  for (;;) {
    const now = Date.now();
    const history = (endpointBuckets.get(bucketKey) || []).filter(
      (stamp) => now - stamp < ENDPOINT_WINDOW_MS,
    );
    if (history.length < ENDPOINT_MAX_RPS) {
      history.push(now);
      endpointBuckets.set(bucketKey, history);
      return;
    }
    const waitMs = Math.max(20, ENDPOINT_WINDOW_MS - (now - history[0]) + 10);
    await delay(waitMs);
  }
}

function formatErrorMessage(payload: TimewebErrorPayload, status: number): string {
  if (Array.isArray(payload.message) && payload.message.length)
    return payload.message.join("; ");
  if (typeof payload.message === "string" && payload.message.trim())
    return payload.message.trim();
  return `Timeweb API HTTP ${status}`;
}

export type TimewebRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  token?: string;
};

async function executeTimewebFetch(
  path: string,
  options: TimewebRequestOptions = {},
): Promise<string | undefined> {
  const token = options.token ?? timewebToken();
  if (!token) {
    throw new TimewebApiError(
      503,
      "missing_token",
      null,
      path,
      "TIMEWEB_TOKEN is not configured.",
    );
  }

  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxRetries = options.retries ?? (method === "GET" ? 2 : 0);

  for (let attempt = 0; ; attempt++) {
    await paceEndpoint(path);
    let response: Response;
    try {
      response = await fetch(`${timewebBaseUrl()}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const retryable = attempt < maxRetries;
      if (retryable) {
        await delay(250 * 2 ** attempt);
        continue;
      }
      throw new TimewebApiError(
        504,
        "upstream_network_error",
        null,
        path,
        error instanceof Error ? error.message : "Network failure",
      );
    }

    if (response.status === 204) return undefined;

    const text = await response.text();
    if (response.ok) return text;

    let payload: TimewebErrorPayload = {};
    if (text) {
      try {
        payload = JSON.parse(text) as TimewebErrorPayload;
      } catch {
        payload = {};
      }
    }

    const responseId =
      typeof payload.response_id === "string" ? payload.response_id : null;
    const errorCode =
      typeof payload.error_code === "string"
        ? payload.error_code
        : `http_${response.status}`;
    const message = formatErrorMessage(payload, response.status);

    const transient = response.status === 429 || response.status >= 500;
    if (transient && attempt < maxRetries) {
      const retryAfterSec = Number(response.headers.get("retry-after"));
      const backoffMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(retryAfterSec * 1000, 5000)
        : 300 * 2 ** attempt;
      await delay(backoffMs);
      continue;
    }

    console.error("Timeweb API error", {
      method,
      endpoint: normalizeBucket(path),
      status: response.status,
      errorCode,
      responseId,
    });

    throw new TimewebApiError(
      response.status,
      errorCode,
      responseId,
      path,
      message,
    );
  }
}

/**
 * Executes an authenticated HTTPS JSON request against Timeweb Cloud Public API.
 */
export async function timewebRequest<T>(
  path: string,
  options: TimewebRequestOptions = {},
): Promise<T> {
  const text = await executeTimewebFetch(path, options);
  if (text === undefined || !text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Executes an authenticated request expecting plain text / YAML output (e.g., kubeconfig).
 */
export async function timewebRequestText(
  path: string,
  options: TimewebRequestOptions = {},
): Promise<string> {
  return (await executeTimewebFetch(path, options)) ?? "";
}

