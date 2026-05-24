export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getClerkJsUrl() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  }

  const encodedFrontendApi = publishableKey.split("_")[2];
  const frontendApi = Buffer.from(encodedFrontendApi, "base64")
    .toString("utf8")
    .replace(/\$$/, "");
  const version = process.env.NEXT_PUBLIC_CLERK_JS_VERSION || "6";

  return `https://${frontendApi}/npm/@clerk/clerk-js@${version}/dist/clerk.browser.js`;
}

export async function GET() {
  const response = await fetch(getClerkJsUrl(), { cache: "no-store" });

  if (!response.ok || !response.body) {
    return Response.json(
      { error: "Unable to load Clerk JS" },
      { status: response.status || 502 }
    );
  }

  return new Response(response.body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
}
