"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  Eye,
  Globe2,
  Languages,
  Loader2,
  MessageSquarePlus,
  Settings,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ModelSourceConfigurator } from "@/components/model-source-configurator";
import { Button } from "@/components/ui/button";
import {
  checkProviderHealth,
  checkTavilyMcpHealthApi,
  deleteProject,
} from "@/lib/api";
import type { ProviderHealthResult, TavilyMcpHealthResult } from "@/lib/api";
import {
  MODEL_SOURCE_CONFIGURED_EVENT,
  MODEL_SOURCE_STORAGE_KEY,
  ONLINE_EVIDENCE_CHANGED_EVENT,
  ONLINE_EVIDENCE_STORAGE_KEY,
  getModelSourceMetadata,
  markModelSourceSetupCompleted,
  normalizeModelSourceSettings,
  parseStoredOnlineEvidenceEnabled,
  parseStoredModelSourceSettings,
  setOnlineEvidenceEnabled,
} from "@/lib/model-source";
import { describeModelSourceForUi } from "@/lib/model-source-display";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ModelSourceSettings, ResearchProject } from "@/lib/types";

const projectDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "short",
  day: "numeric",
  weekday: "short",
});

const DELETING_PROJECT_SESSION_KEY = "paperforge-deleting-project-id";

export function ResearchSidebar({
  project,
  onStartNewConversation,
  onOpenProject,
  isComposingNewConversation,
}: {
  project: ResearchProject;
  onStartNewConversation: () => void;
  onOpenProject: () => void;
  isComposingNewConversation: boolean;
}) {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelSettings, setModelSettings] = useState<ModelSourceSettings>({
    source: "paperforge",
  });
  const [activeModelSettings, setActiveModelSettings] =
    useState<ModelSourceSettings>({
      source: "paperforge",
    });
  const [providerHealth, setProviderHealth] =
    useState<ProviderHealthResult | null>(null);
  const [isCheckingProvider, setIsCheckingProvider] = useState(false);
  const [mcpHealth, setMcpHealth] = useState<TavilyMcpHealthResult | null>(
    null
  );
  const [isCheckingMcp, setIsCheckingMcp] = useState(false);
  const [onlineEvidenceEnabled, setOnlineEvidenceEnabledState] =
    useState(true);
  const activeModelSummary = describeModelSourceForUi(
    activeModelSettings,
    providerHealth
  );

  useEffect(() => {
    function readActiveModelSettings() {
      setActiveModelSettings(
        parseStoredModelSourceSettings(
          window.localStorage.getItem(MODEL_SOURCE_STORAGE_KEY)
        )
      );
    }

    readActiveModelSettings();
    window.addEventListener(
      MODEL_SOURCE_CONFIGURED_EVENT,
      readActiveModelSettings
    );
    return () =>
      window.removeEventListener(
        MODEL_SOURCE_CONFIGURED_EVENT,
        readActiveModelSettings
      );
  }, []);

  useEffect(() => {
    function readOnlineEvidenceSetting() {
      setOnlineEvidenceEnabledState(
        parseStoredOnlineEvidenceEnabled(
          window.localStorage.getItem(ONLINE_EVIDENCE_STORAGE_KEY)
        )
      );
    }

    readOnlineEvidenceSetting();
    window.addEventListener(
      ONLINE_EVIDENCE_CHANGED_EVENT,
      readOnlineEvidenceSetting
    );
    return () =>
      window.removeEventListener(
        ONLINE_EVIDENCE_CHANGED_EVENT,
        readOnlineEvidenceSetting
      );
  }, []);

  function toggleSettings() {
    if (!settingsOpen) {
      setModelSettings(
        parseStoredModelSourceSettings(
          window.localStorage.getItem(MODEL_SOURCE_STORAGE_KEY)
        )
      );
    }
    setSettingsOpen((open) => !open);
  }

  function resetModelSettings() {
    setModelSettings(
      parseStoredModelSourceSettings(
        window.localStorage.getItem(MODEL_SOURCE_STORAGE_KEY)
      )
    );
  }

  function handleModelSettingsChange(settings: ModelSourceSettings) {
    setModelSettings(settings);
    setProviderHealth(null);
  }

  function handleOnlineEvidenceToggle(enabled: boolean) {
    setOnlineEvidenceEnabledState(enabled);
    setOnlineEvidenceEnabled(window.localStorage, enabled);
    window.dispatchEvent(new Event(ONLINE_EVIDENCE_CHANGED_EVENT));
    toast.success(enabled ? "联网搜索已开启" : "联网搜索已关闭", {
      description: enabled
        ? "开启后，新方向会先做联网搜索，再整理可引用来源。"
        : "关闭后，新方向只使用本地模型推理，不发起联网搜索。",
    });
  }

  const formalProjects = state.projects.filter(
    (item) => item.projectType === "formal"
  );
  const explorationProjects = state.projects.filter(
    (item) => item.projectType === "exploration"
  );
  const groupedFormalProjects = groupProjectsByDate(formalProjects);
  const groupedExplorationProjects = groupProjectsByDate(explorationProjects);

  async function handleDeleteProject(targetProject: ResearchProject) {
    const confirmed = window.confirm(
      `删除“${targetProject.refinedIdea || targetProject.rawIdea}”？此操作不会影响其它记录。`
    );
    if (!confirmed) return;

    try {
      await deleteProject(targetProject.id);
      const isDeletingActiveProject = targetProject.id === project.id;
      if (isDeletingActiveProject) {
        window.sessionStorage.setItem(
          DELETING_PROJECT_SESSION_KEY,
          targetProject.id
        );
      }
      dispatch({ type: "DELETE_PROJECT", payload: targetProject.id });
      if (isDeletingActiveProject) {
        router.replace("/research?new=1", { scroll: false });
        window.setTimeout(() => {
          window.sessionStorage.removeItem(DELETING_PROJECT_SESSION_KEY);
        }, 1000);
      }
      toast.success("Record deleted");
    } catch (error) {
      console.error("Failed to delete project", error);
      toast.error("删除失败");
    }
  }

  async function handleCheckProviderHealth() {
    if (isCheckingProvider) return;

    setIsCheckingProvider(true);
    try {
      const sourceForCheck = normalizeModelSourceSettings(modelSettings);
      const result = await checkProviderHealth(sourceForCheck);
      setProviderHealth(result);

      if (result.ok) {
        toast.success(
          sourceForCheck.source === "own"
            ? "自有模型连通正常"
            : "默认模型连通正常",
          {
            description: formatProviderHealthDetail(result),
          }
        );
      } else {
        toast.error(
          sourceForCheck.source === "own"
            ? "自有模型不可用"
            : "默认模型不可用",
          {
            description: result.message,
          }
        );
      }
    } catch (error) {
      console.error("Failed to check provider health", error);
      setProviderHealth({
        ok: false,
        configured: false,
        code: "network_error",
        message: "连通检测接口请求失败。",
        provider: {
          baseUrl: "",
          model: "",
        },
      });
      toast.error("连通检测失败", {
        description: "请稍后重试，或检查本地服务是否正常。",
      });
    } finally {
      setIsCheckingProvider(false);
    }
  }

  async function handleCheckMcpHealth() {
    if (isCheckingMcp) return;

    setIsCheckingMcp(true);
    try {
      const result = await checkTavilyMcpHealthApi();
      setMcpHealth(result);

      if (result.ok) {
        toast.success("联网检索已启用", {
          description: getMcpHealthUserDetail(result),
        });
      } else {
        toast.error("联网检索不可用", {
          description: getMcpHealthUserDetail(result),
        });
      }
    } catch (error) {
      console.error("Failed to check MCP health", error);
      setMcpHealth({
        ok: false,
        configured: false,
        code: "connection_failed",
        message: "MCP 健康检查接口请求失败。",
        endpoint: "",
        tools: [],
        hasSearchTool: false,
      });
      toast.error("MCP 检测失败", {
        description: "请稍后重试，或检查本地服务是否正常。",
      });
    } finally {
      setIsCheckingMcp(false);
    }
  }

  return (
    <aside className="hidden h-full min-h-0 w-full flex-col border-r border-border/70 bg-background/95 lg:flex">
      <div className="flex h-14 items-center border-b border-border/70 px-4">
        <Link href="/" className="font-serif text-base font-semibold">
          PaperForge
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <NavSection
          title="正式项目"
          groupedProjects={groupedFormalProjects}
          activeId={project.id}
          onOpenProject={onOpenProject}
          onDelete={handleDeleteProject}
        />
        <NavSection
          title="探索记录"
          groupedProjects={groupedExplorationProjects}
          activeId={project.id}
          onOpenProject={onOpenProject}
          onDelete={handleDeleteProject}
          action={
            <Button
              variant={isComposingNewConversation ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={onStartNewConversation}
              title="开启新对话"
            >
              <MessageSquarePlus className="size-3.5" />
              新对话
            </Button>
          }
        />
      </div>

      <div className="relative border-t border-border/70 bg-background/95 p-3">
        {settingsOpen && (
          <div className="absolute bottom-[calc(100%+0.5rem)] left-3 right-3 z-20 max-h-[min(34rem,calc(100vh-7rem))] overflow-y-auto rounded-lg border border-border/80 bg-card/95 p-3 shadow-lg shadow-black/10 backdrop-blur-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Settings
                </p>
                <h2 className="mt-1 font-serif text-base font-semibold">
                  工作台设置
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSettingsOpen(false)}
                title="关闭设置"
              >
                <X className="size-4" />
              </Button>
            </div>

            <section className="mb-4 space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Languages className="size-4 text-primary" />
                语言
              </h3>
              <div className="inline-flex rounded-lg border bg-background p-1">
                <button className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  中文
                </button>
                <button
                  className="rounded-md px-3 py-1 text-xs text-muted-foreground"
                  type="button"
                  onClick={() => toast.info("英文界面将在后续版本接入")}
                >
                  English
                </button>
              </div>
            </section>

            <section className="mb-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Globe2 className="size-4 text-primary" />
                  联网 / MCP
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-[11px]"
                  disabled={isCheckingMcp}
                  onClick={() => void handleCheckMcpHealth()}
                >
                  {isCheckingMcp ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CircleCheck className="size-3.5" />
                  )}
                  检测 MCP
                </Button>
              </div>
              <OnlineEvidenceToggle
                enabled={onlineEvidenceEnabled}
                onChange={handleOnlineEvidenceToggle}
              />
              <McpHealthInlineStatus
                result={mcpHealth}
                isChecking={isCheckingMcp}
              />
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <SlidersHorizontal className="size-4 text-primary" />
                  模型设置
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-[11px]"
                  disabled={isCheckingProvider}
                  onClick={() => void handleCheckProviderHealth()}
                >
                  {isCheckingProvider ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CircleCheck className="size-3.5" />
                  )}
                  检测连通
                </Button>
              </div>
              <ProviderHealthInlineStatus
                settings={modelSettings}
                result={providerHealth}
                isChecking={isCheckingProvider}
              />
              <ModelSourceSummaryBox
                title="当前表单将使用"
                summary={describeModelSourceForUi(modelSettings, providerHealth)}
              />
              <ModelSourceConfigurator
                settings={modelSettings}
                onSettingsChange={handleModelSettingsChange}
                compact
              />
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetModelSettings();
                    setSettingsOpen(false);
                  }}
                >
                  取消
                </Button>
                <Button
                  className="gap-1.5"
                  onClick={() => {
                    try {
                      const normalized =
                        normalizeModelSourceSettings(modelSettings);
                      window.localStorage.setItem(
                        MODEL_SOURCE_STORAGE_KEY,
                        JSON.stringify(normalized)
                      );
                      markModelSourceSetupCompleted(window.localStorage);
                      window.dispatchEvent(
                        new Event(MODEL_SOURCE_CONFIGURED_EVENT)
                      );
                      setActiveModelSettings(normalized);
                      dispatch({
                        type: "UPDATE_PROJECT",
                        payload: {
                          modelSource: getModelSourceMetadata(normalized),
                        },
                      });
                      toast.success("模型设置已更新", {
                        description:
                          "这不会创建新研究，也不会清空当前对话。",
                      });
                      setSettingsOpen(false);
                    } catch (error) {
                      toast.error("请补全模型来源配置", {
                        description:
                          error instanceof Error
                            ? error.message
                            : "当前配置无法用于生成研究。",
                      });
                    }
                  }}
                >
                  <Check className="size-4" />
                  保存
                </Button>
              </div>
            </section>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <UserButton />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {activeModelSummary.label}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {activeModelSummary.detail}
              </p>
            </div>
          </div>
          <Button
            variant={settingsOpen ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={toggleSettings}
            title="设置"
          >
            <Settings className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}

function McpHealthInlineStatus({
  result,
  isChecking,
}: {
  result: TavilyMcpHealthResult | null;
  isChecking: boolean;
}) {
  const status = isChecking
    ? {
        icon: <Loader2 className="mt-0.5 size-3.5 animate-spin" />,
        label: "正在检测联网检索",
        detail: "正在确认方向发现是否可以联网搜索。",
        className:
          "border-[oklch(0.84_0.03_225)] bg-[oklch(0.965_0.018_225)] text-[oklch(0.35_0.055_225)]",
      }
    : result?.ok
      ? {
          icon: <CircleCheck className="mt-0.5 size-3.5" />,
          label: "联网检索已启用",
          detail: getMcpHealthUserDetail(result),
          className:
            "border-[oklch(0.82_0.04_155)] bg-[oklch(0.965_0.026_155)] text-[oklch(0.34_0.065_155)]",
        }
      : result
        ? {
            icon: <CircleAlert className="mt-0.5 size-3.5" />,
            label: result.configured ? "联网检索暂不可用" : "尚未配置联网检索",
            detail: getMcpHealthUserDetail(result),
            className:
              "border-[oklch(0.83_0.055_55)] bg-[oklch(0.965_0.03_75)] text-[oklch(0.38_0.07_55)]",
          }
        : {
            icon: <CircleMinus className="mt-0.5 size-3.5" />,
            label: "尚未检测联网检索",
            detail:
              "点击检测即可确认联网搜索是否可用。",
            className:
              "border-border bg-background text-muted-foreground",
          };

  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border px-3 py-2 text-xs leading-5",
        status.className
      )}
    >
      {status.icon}
      <div className="min-w-0">
        <p className="font-medium">{status.label}</p>
        <p className="mt-0.5 break-words">{status.detail}</p>
      </div>
    </div>
  );
}

function OnlineEvidenceToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs leading-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">联网搜索</p>
          <p className="mt-0.5 text-muted-foreground">
            {enabled
              ? "开启后，新方向会先做联网搜索，再整理可引用来源。"
              : "关闭后，新方向只使用本地模型推理，不发起联网搜索。"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          className={[
            "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors",
            enabled
              ? "border-primary bg-primary"
              : "border-border bg-muted",
          ].join(" ")}
          onClick={() => onChange(!enabled)}
          title={enabled ? "关闭联网搜索" : "开启联网搜索"}
        >
          <span
            className={[
              "block size-4 rounded-full bg-background shadow-sm transition-transform",
              enabled ? "translate-x-5" : "translate-x-1",
            ].join(" ")}
          />
        </button>
      </div>
    </div>
  );
}

function ProviderHealthInlineStatus({
  settings,
  result,
  isChecking,
}: {
  settings: ModelSourceSettings;
  result: ProviderHealthResult | null;
  isChecking: boolean;
}) {
  const sourceLabel = settings.source === "own" ? "自有模型" : "默认模型";
  const status = isChecking
    ? {
        icon: <Loader2 className="mt-0.5 size-3.5 animate-spin" />,
        label: `正在检测${sourceLabel}连通性`,
        detail: "会发送一条很小的 ping 请求，不会产生研究内容。",
        className:
          "border-[oklch(0.84_0.03_225)] bg-[oklch(0.965_0.018_225)] text-[oklch(0.35_0.055_225)]",
      }
    : result?.ok
      ? {
          icon: <CircleCheck className="mt-0.5 size-3.5" />,
          label: `${sourceLabel}可用`,
          detail: formatProviderHealthDetail(result),
          className:
            "border-[oklch(0.82_0.04_155)] bg-[oklch(0.965_0.026_155)] text-[oklch(0.34_0.065_155)]",
        }
      : result
        ? {
            icon: <CircleAlert className="mt-0.5 size-3.5" />,
            label: `${sourceLabel}不可用`,
            detail: `${result.message}${formatProviderCheckDetail(result)}`,
            className:
              "border-[oklch(0.83_0.055_55)] bg-[oklch(0.965_0.03_75)] text-[oklch(0.38_0.07_55)]",
          }
        : {
            icon: <CircleMinus className="mt-0.5 size-3.5" />,
            label: `尚未检测${sourceLabel}`,
            detail:
              settings.source === "own"
                ? "这里会检测当前表单里的模型配置，API key 只用于本次检测。"
                : "这里检测的是服务端默认模型配置。",
            className:
              "border-border bg-background text-muted-foreground",
          };

  return (
    <div
      className={cn(
        "mb-3 flex gap-2 rounded-md border px-3 py-2 text-xs leading-5",
        status.className
      )}
    >
      {status.icon}
      <div className="min-w-0">
        <p className="font-medium">{status.label}</p>
        <p className="mt-0.5">{status.detail}</p>
      </div>
    </div>
  );
}

function ModelSourceSummaryBox({
  title,
  summary,
}: {
  title: string;
  summary: ReturnType<typeof describeModelSourceForUi>;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs leading-5">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-muted-foreground">{summary.label}</p>
      <p className="text-muted-foreground">{summary.detail}</p>
    </div>
  );
}

function formatProviderHealthDetail(result: ProviderHealthResult) {
  const parts = [result.provider.model];

  if (result.latencyMs !== undefined) {
    parts.push(`${result.latencyMs}ms`);
  }

  if (result.statusCode) {
    parts.push(`HTTP ${result.statusCode}`);
  }

  return parts.join(" · ");
}

function formatProviderCheckDetail(result: ProviderHealthResult) {
  const json = result.checks?.json;
  if (!json || json.ok) return "";

  return `（JSON 模式：${json.message}）`;
}

function getMcpHealthUserDetail(result: TavilyMcpHealthResult) {
  if (result.ok) {
    return "方向发现会自动使用联网搜索结果。";
  }

  switch (result.code) {
    case "missing_mcp_url":
      return "服务端还没有配置 Tavily MCP。";
    case "invalid_mcp_url":
      return "服务端 MCP 配置格式不正确。";
    case "missing_search_tool":
      return "MCP 已连接，但缺少搜索能力。";
    case "connection_failed":
      return "暂时无法连接联网检索服务。";
    case "connected":
      return "联网检索已启用。";
  }
}

function groupProjectsByDate(projects: ResearchProject[]) {
  const sortedProjects = [...projects].sort(
    (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)
  );
  const groups: Array<{
    key: string;
    label: string;
    projects: ResearchProject[];
  }> = [];

  for (const project of sortedProjects) {
    const createdAt = new Date(project.createdAt);
    const key = `${createdAt.getFullYear()}-${createdAt.getMonth()}-${createdAt.getDate()}`;
    const label = projectDateFormatter.format(createdAt);
    const currentGroup = groups[groups.length - 1];

    if (currentGroup && currentGroup.key === key) {
      currentGroup.projects.push(project);
      continue;
    }

    groups.push({
      key,
      label,
      projects: [project],
    });
  }

  return groups;
}

function NavSection({
  title,
  groupedProjects,
  activeId,
  action,
  onOpenProject,
  onDelete,
}: {
  title: string;
  groupedProjects: ReturnType<typeof groupProjectsByDate>;
  activeId: string;
  action?: React.ReactNode;
  onOpenProject: (project: ResearchProject) => void;
  onDelete: (project: ResearchProject) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const totalCount = groupedProjects.reduce(
    (count, group) => count + group.projects.length,
    0
  );

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2 px-2">
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          >
          <ChevronDown
            className={cn(
              "size-3 transition-transform",
              !isOpen && "-rotate-90"
            )}
          />
          <span className="truncate">{title}</span>
          <span className="text-[10px] text-muted-foreground/80">
            {totalCount}
          </span>
        </button>
        {action}
      </div>
      <div className={cn("space-y-1", !isOpen && "hidden")}>
        {groupedProjects.length > 0 ? (
          groupedProjects.map((group) => (
            <div key={group.key} className="space-y-1.5">
              <div className="flex items-center gap-1.5 px-2.5 pt-1 text-[11px] font-medium text-muted-foreground">
                <CalendarDays className="size-3.5 shrink-0" />
                <span>{group.label}</span>
                <span className="text-[10px] text-muted-foreground/70">
                  {group.projects.length}
                </span>
              </div>
              <div className="space-y-1">
                {group.projects.map((project) => {
                  const title = project.refinedIdea || project.rawIdea;

                  return (
                    <div
                      key={project.id}
                      className={cn(
                        "rounded-md px-2.5 py-2 text-sm leading-5 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground",
                        "data-[active=true]:border data-[active=true]:border-border/60 data-[active=true]:bg-background data-[active=true]:font-medium data-[active=true]:text-foreground"
                      )}
                      data-active={project.id === activeId}
                    >
                      <Link
                        href={`/research/${project.id}`}
                        className="block min-w-0"
                        title={`查看记录：${title}`}
                        aria-label={`查看记录：${title}`}
                        onClick={() => onOpenProject(project)}
                      >
                        <span className="line-clamp-2">{title}</span>
                      </Link>
                      <div className="mt-2 flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="xs"
                          className="h-6 gap-1 px-1.5 text-[11px]"
                          nativeButton={false}
                          render={
                            <Link
                              href={`/research/${project.id}`}
                              onClick={() => onOpenProject(project)}
                            />
                          }
                          title={`查看记录：${title}`}
                          aria-label={`查看记录：${title}`}
                        >
                          <Eye className="size-3" />
                          查看
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title={`删除记录：${title}`}
                          aria-label={`删除记录：${title}`}
                          onClick={(event) => {
                            event.preventDefault();
                            onDelete(project);
                          }}
                        >
                          <Trash2 className="size-3" />
                          删除
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <p className="px-2.5 py-2 text-xs leading-5 text-muted-foreground">
            暂无记录
          </p>
        )}
      </div>
    </section>
  );
}
