import { auth } from "@clerk/nextjs/server";

import { DEVELOPMENT_GUEST_USER_ID, isDevelopmentGuestMode } from "./auth";

export async function getRequestUserId() {
  if (isDevelopmentGuestMode()) {
    return DEVELOPMENT_GUEST_USER_ID;
  }

  const { userId } = await auth();
  return userId;
}
