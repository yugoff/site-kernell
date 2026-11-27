import "server-only";
import { cloudSetting } from "./settings";

export function salesEnabled() {
  return cloudSetting("CLOUD_SALES_ENABLED") === "true";
}
