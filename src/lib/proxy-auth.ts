import { isDevelopmentGuestMode } from "./auth.ts";

export function shouldBypassClerkProxy(): boolean {
  return isDevelopmentGuestMode();
}
