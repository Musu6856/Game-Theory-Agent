import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 block text-center font-serif text-2xl font-semibold"
        >
          PaperForge
        </Link>
        <div className="rounded-lg border bg-card p-5 shadow-xl shadow-foreground/5">
          <SignIn fallbackRedirectUrl="/launch" signUpUrl="/sign-up" />
        </div>
      </div>
    </main>
  );
}
