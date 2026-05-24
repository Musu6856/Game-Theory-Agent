export const DEVELOPMENT_GUEST_USER_ID = "dev-guest-user";

export function isDevelopmentGuestMode() {
  return process.env.NODE_ENV === "development";
}
