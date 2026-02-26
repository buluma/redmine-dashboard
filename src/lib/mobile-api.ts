import { env } from "@/src/lib/env";

export function assertMobileApiEnabled(): void {
  if (!env.mobileApiEnabled) {
    throw new Error("Mobile API is disabled");
  }
}
