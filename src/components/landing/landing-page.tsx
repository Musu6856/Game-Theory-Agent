import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProductPreview } from "./product-preview";
import { SiteHeader } from "./site-header";
import { StartResearchLink } from "./start-research-link";

export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main>
        <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center gap-12 px-5 py-12 lg:grid-cols-[520px_minmax(0,1fr)] lg:py-16">
          <div className="max-w-xl">
            <h1 className="font-serif text-5xl font-semibold leading-[1.12] tracking-tight text-foreground md:text-6xl">
              从模糊选题到
              <br />
              可求解的博弈论模型
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              面向平台经济与博弈论论文写作，帮助你从模糊想法中聚焦研究方向，并把模型设定、公式推导和性质分析整理成连续的研究流程。
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <StartResearchLink className="h-12 gap-2 px-7 text-base" />
              <button
                type="button"
                disabled
                className={cn(
                  buttonVariants({ variant: "ghost", size: "lg" }),
                  "h-12 px-5 text-base"
                )}
                title="案例功能会和顶部文档入口一起补充"
              >
                查看案例
              </button>
            </div>
          </div>
          <ProductPreview />
        </section>
      </main>
    </div>
  );
}
