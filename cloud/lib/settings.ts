import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export function cloudSetting(name: string): string | undefined {
  const { env } = getCloudflareContext();
  const value = (env as unknown as Record<string, unknown>)[name];
  if (typeof value === "string") return value;
  return process.env.NODE_ENV === "development" ? process.env[name] : undefined;
}
