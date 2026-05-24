import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/markdown-renderer";

export function ProductPreview() {
  return (
    <div className="relative hidden min-h-[560px] perspective-distant lg:block">
      <div className="absolute inset-y-0 right-0 w-full max-w-[760px] origin-right overflow-hidden rounded-lg border border-border bg-card shadow-2xl shadow-foreground/10 transition-transform duration-500 ease-out hover:scale-[0.985] xl:-rotate-y-3 xl:rotate-x-1">
        <div className="flex h-10 items-center gap-2 border-b bg-muted/55 px-4">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="mx-auto pr-12 font-mono text-[11px] text-muted-foreground">
            workspace / 二手平台佣金与补贴机制
          </span>
        </div>

        <div className="grid h-[520px] grid-cols-[minmax(0,1fr)_260px] bg-background">
          <main className="space-y-5 overflow-hidden p-6">
            <div className="flex gap-3">
              <div className="flex size-7 shrink-0 items-center justify-center rounded bg-border text-xs font-semibold">
                U
              </div>
              <div className="max-w-[440px] rounded-r-md rounded-bl-md border bg-card px-4 py-3 text-sm leading-6 shadow-sm">
                我想研究二手交易平台的佣金与补贴策略。平台应该对谁收费？
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex size-7 shrink-0 items-center justify-center rounded bg-foreground font-serif text-xs font-semibold text-background">
                P
              </div>
              <div className="min-w-0 flex-1 space-y-3 pt-1 text-sm leading-6">
                <p>
                  这是一个典型的双边市场交叉网络外部性问题。我先给出一个最适合符号求解的方向：
                </p>
                <div className="rounded-md border border-primary/45 bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-serif text-base font-semibold">
                        双边 Hotelling 平台竞争模型
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        同时允许买方补贴与卖方佣金，推导平台的最优倾斜定价。
                      </p>
                    </div>
                    <Badge variant="secondary">推荐</Badge>
                  </div>
                  <div className="mt-4 overflow-x-auto rounded bg-muted/60 px-3 py-2 text-center">
                    <MarkdownRenderer
                      content="$U_{A}^{B}=v_B+\\alpha_B n_{A}^{S}+s_A-p-t_B x$"
                      className="reader-page text-sm"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">高可解性</Badge>
                    <Badge variant="outline">符号推导</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  接下来确认模型设定，再进入符号化均衡求解。
                </p>
              </div>
            </div>
          </main>

          <aside className="border-l bg-card p-4">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              研究资产
            </p>
            <div className="mt-5 space-y-5">
              <section>
                <h4 className="mb-2 text-xs font-semibold">定义变量</h4>
                <AssetRow symbol="α" text="交叉网络外部性" />
                <AssetRow symbol="sᵢ" text="买家补贴" />
                <AssetRow symbol="τᵢ" text="卖家佣金" />
              </section>
              <section>
                <h4 className="mb-2 text-xs font-semibold">核心假设</h4>
                <p className="text-xs leading-5 text-muted-foreground">
                  A1. 买家和卖家均匀分布在线性城市。
                  <br />
                  A2. 平台先选择佣金与补贴，再由用户选择平台。
                </p>
              </section>
              <section>
                <h4 className="mb-2 text-xs font-semibold">均衡状态</h4>
                <span className="inline-flex rounded-sm bg-amber-100 px-2 py-1 text-xs text-amber-800">
                  等待模型确认
                </span>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function AssetRow({ symbol, text }: { symbol: string; text: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 rounded bg-muted/55 px-2 py-1.5 text-xs">
      <span className="w-7 font-serif font-semibold italic text-primary">
        {symbol}
      </span>
      <span className="text-muted-foreground">{text}</span>
    </div>
  );
}
