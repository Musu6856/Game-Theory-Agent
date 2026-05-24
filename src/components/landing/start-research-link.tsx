"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  MODEL_SOURCE_CONFIGURED_EVENT,
  MODEL_SOURCE_CONFIGURED_KEY,
  getStartResearchDestination,
  hasCompletedModelSourceSetup,
} from "@/lib/model-source";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type ButtonVariantOptions = NonNullable<Parameters<typeof buttonVariants>[0]>;

function subscribeModelSourceSetup(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(MODEL_SOURCE_CONFIGURED_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(MODEL_SOURCE_CONFIGURED_EVENT, onStoreChange);
  };
}

function getModelSourceSetupSnapshot(): boolean {
  return hasCompletedModelSourceSetup(
    window.localStorage.getItem(MODEL_SOURCE_CONFIGURED_KEY)
  );
}

function getServerModelSourceSetupSnapshot(): boolean {
  return false;
}

export function StartResearchLink({
  label = "开始研究",
  variant = "default",
  size = "lg",
  className,
  showArrow = true,
}: {
  label?: string;
  variant?: ButtonVariantOptions["variant"];
  size?: ButtonVariantOptions["size"];
  className?: string;
  showArrow?: boolean;
}) {
  const { state } = useStore();
  const setupCompleted = useSyncExternalStore(
    subscribeModelSourceSetup,
    getModelSourceSetupSnapshot,
    getServerModelSourceSetupSnapshot
  );

  const href = getStartResearchDestination({
    setupCompleted,
    hasExistingProjects: state.projects.length > 0,
  });

  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {label}
      {showArrow && <ArrowRight className="size-4" />}
    </Link>
  );
}
