import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { shouldBypassClerkProxy } from "@/lib/proxy-auth";

const isProtectedRoute = createRouteMatcher([
  "/launch(.*)",
  "/research(.*)",
  "/projects(.*)",
  "/api(.*)",
]);

const protectedClerkProxy = clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export default function proxy(
  ...args: Parameters<typeof protectedClerkProxy>
): ReturnType<typeof protectedClerkProxy> {
  if (shouldBypassClerkProxy()) {
    return NextResponse.next() as ReturnType<typeof protectedClerkProxy>;
  }

  return protectedClerkProxy(...args);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
