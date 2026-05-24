import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
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
          <SignUp fallbackRedirectUrl="/launch" signInUrl="/sign-in" />
        </div>
      </div>
    </main>
  );
}
