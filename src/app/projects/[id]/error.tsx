"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-screen px-6">
      <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-5">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold mb-1">页面加载失败</h2>
      <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
        {error.message || "项目页面出现异常，请重试或返回首页。"}
      </p>
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => router.push("/")}
          className="gap-1.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 返回首页
        </Button>
        <Button onClick={reset} className="gap-1.5">
          重试
        </Button>
      </div>
    </div>
  );
}
