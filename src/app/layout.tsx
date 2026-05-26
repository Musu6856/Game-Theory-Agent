import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "katex/dist/katex.min.css";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "PaperForge - 博弈论论文工作台",
  description: "AI 协作式博弈论与双边平台论文写作助手",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <StoreProvider>
            {children}
            <Toaster />
          </StoreProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
