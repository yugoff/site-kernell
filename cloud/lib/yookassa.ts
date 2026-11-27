import "server-only";
import { cloudSetting } from "./settings";
import { isIPv4, isIPv6 } from "node:net";

const DEFAULT_YOOKASSA_API = "https://api.yookassa.ru/v3";

// Official YooKassa notification source CIDRs:
// https://yookassa.ru/developers/using-api/webhooks
const YOOKASSA_IPV4_CIDRS: Array<[string, number]> = [
  ["185.71.76.0", 27],
  ["185.71.77.0", 27],
  ["77.75.153.0", 25],
  ["77.75.154.128", 25],
  ["77.75.156.11", 32],
  ["77.75.156.35", 32],
];
const YOOKASSA_IPV6_PREFIX = "2a02:5180:";

export type YooKassaPaymentObject = {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid: boolean;
  amount: { value: string; currency: string };
  income_amount?: { value: string; currency: string };
  confirmation?: {
    type: string;
    confirmation_url?: string;
    return_url?: string;
  };
  receipt_registration?: string;
  metadata?: Record<string, string>;
  cancellation_details?: { party?: string; reason?: string };
  created_at: string;
};

export class YooKassaApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "YooKassaApiError";
  }
}

export function yookassaConfig() {
  const shopId = cloudSetting("YOOKASSA_SHOP_ID")?.trim() || "";
  const secretKey = cloudSetting("YOOKASSA_SECRET_KEY")?.trim() || "";
  const apiUrl = (
    cloudSetting("YOOKASSA_API_URL")?.trim() || DEFAULT_YOOKASSA_API
  ).replace(/\/$/, "");
  const vatCodeRaw = Number(cloudSetting("YOOKASSA_VAT_CODE"));
  const vatCode =
    Number.isInteger(vatCodeRaw) && vatCodeRaw >= 1 && vatCodeRaw <= 12
      ? vatCodeRaw
      : 1;
  const taxRaw = Number(cloudSetting("YOOKASSA_TAX_SYSTEM_CODE"));
  const taxSystemCode =
    Number.isInteger(taxRaw) && taxRaw >= 1 && taxRaw <= 6 ? taxRaw : undefined;
  const paymentMode =
    cloudSetting("YOOKASSA_TOPUP_PAYMENT_MODE")?.trim() || "advance";
  const paymentSubject =
    cloudSetting("YOOKASSA_TOPUP_PAYMENT_SUBJECT")?.trim() || "payment";

  return {
    shopId,
    secretKey,
    apiUrl,
    vatCode,
    taxSystemCode,
    paymentMode,
    paymentSubject,
  };
}

export function yookassaConfigured(): boolean {
  const { shopId, secretKey } = yookassaConfig();
  return Boolean(shopId && secretKey);
}

function ipv4ToInt(ip: string): number {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => ((acc << 8) | Number(octet)) >>> 0, 0) >>> 0
  );
}

function inIpv4Cidr(ip: string, network: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(network) & mask);
}

function expandIpv6Prefix(ip: string): string {
  const clean = ip.split("%")[0].toLowerCase();
  const [head, tail] = clean.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - (headParts.length + tailParts.length);
  const full =
    tail !== undefined
      ? [...headParts, ...Array(Math.max(0, missing)).fill("0"), ...tailParts]
      : headParts;
  return full.map((part) => part.padStart(4, "0")).join(":");
}

export function isTrustedYooKassaIp(rawIp: string | null): boolean {
  if (!rawIp) return false;
  const ip = rawIp.trim().replace(/^::ffff:/i, "");
  const { apiUrl } = yookassaConfig();
  const parsedApi = URL.parse(apiUrl);
  if (
    parsedApi &&
    (parsedApi.hostname === "127.0.0.1" || parsedApi.hostname === "localhost") &&
    (ip === "127.0.0.1" || ip === "::1")
  ) {
    return true;
  }

  if (isIPv4(ip)) {
    return YOOKASSA_IPV4_CIDRS.some(([net, prefix]) =>
      inIpv4Cidr(ip, net, prefix),
    );
  }
  if (isIPv6(ip)) {
    return expandIpv6Prefix(ip).startsWith(YOOKASSA_IPV6_PREFIX);
  }
  return false;
}

async function yookassaRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    idempotenceKey?: string;
  } = {},
): Promise<T> {
  const { shopId, secretKey, apiUrl } = yookassaConfig();
  if (!shopId || !secretKey) {
    throw new YooKassaApiError(
      503,
      "not_configured",
      "Приём платежей через ЮKassa ещё не настроен.",
    );
  }

  const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.idempotenceKey
        ? { "Idempotence-Key": options.idempotenceKey }
        : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });

  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    const code =
      typeof data.code === "string" ? data.code : `http_${response.status}`;
    const desc =
      typeof data.description === "string"
        ? data.description
        : `YooKassa HTTP ${response.status}`;
    console.error("YooKassa API error", {
      path,
      status: response.status,
      code,
    });
    throw new YooKassaApiError(response.status, code, desc);
  }

  return data as T;
}

/**
 * Creates a YooKassa payment with 54-FZ fiscal receipt items.
 */
export async function createYooKassaPayment(input: {
  paymentId: string;
  amountKopecks: number;
  customerEmail: string;
  returnUrl: string;
  description: string;
  idempotenceKey: string;
}): Promise<YooKassaPaymentObject> {
  const { vatCode, taxSystemCode, paymentMode, paymentSubject } =
    yookassaConfig();
  const value = (input.amountKopecks / 100).toFixed(2);
  return yookassaRequest<YooKassaPaymentObject>("/payments", {
    method: "POST",
    idempotenceKey: input.idempotenceKey,
    body: {
      amount: { value, currency: "RUB" },
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: input.returnUrl,
      },
      description: input.description.slice(0, 128),
      receipt: {
        customer: { email: input.customerEmail },
        ...(taxSystemCode ? { tax_system_code: taxSystemCode } : {}),
        items: [
          {
            description: input.description.slice(0, 128),
            quantity: "1.00",
            amount: { value, currency: "RUB" },
            vat_code: vatCode,
            payment_mode: paymentMode,
            payment_subject: paymentSubject,
          },
        ],
      },
      metadata: {
        payment_id: input.paymentId,
      },
    },
  });
}

/**
 * Fetches authoritative payment status directly from YooKassa API.
 */
export async function getYooKassaPayment(
  externalPaymentId: string,
): Promise<YooKassaPaymentObject> {
  return yookassaRequest<YooKassaPaymentObject>(
    `/payments/${encodeURIComponent(externalPaymentId)}`,
    { method: "GET" },
  );
}

