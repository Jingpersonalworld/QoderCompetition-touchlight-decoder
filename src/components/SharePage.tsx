import { useEffect, useState } from "react";
import { AudioLines, CircleAlert, LoaderCircle, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpeechReader } from "@/lib/speech";
import { TactileButton } from "@/components/ui/TactileButton";
import type { AccessibleContentFields } from "@/types/accessibility";

interface ShareData {
  content: AccessibleContentFields;
  publishedAt: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ShareData };

function normalizeContent(raw: unknown): AccessibleContentFields {
  const c = (raw ?? {}) as Record<string, unknown>;
  const str = (key: string) => (typeof c[key] === "string" ? (c[key] as string) : "");
  return {
    title: str("title"),
    datetime: str("datetime"),
    location: str("location"),
    visualAlt: str("visualAlt"),
    actionGuide: str("actionGuide"),
    actionLabel: str("actionLabel"),
    actionUrl: str("actionUrl"),
    contactInfo: str("contactInfo"),
    summaryPoints: Array.isArray(c.summaryPoints)
      ? c.summaryPoints.filter((p): p is string => typeof p === "string")
      : [],
  };
}

export function SharePage({ id }: { id: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const { supported, speaking, index, subtitle, toggle } = useSpeechReader();

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/functions/v1/app/pages/${encodeURIComponent(id)}`, {
          signal: controller.signal,
          credentials: "same-origin",
        });
        const data: unknown = await res.json().catch(() => null);
        const d = (data ?? {}) as Record<string, unknown>;
        if (res.status === 400) {
          setState({ status: "error", message: "分享链接格式非法，请检查链接是否完整。" });
          return;
        }
        if (res.status === 404) {
          setState({ status: "error", message: "页面不存在或已被移除。" });
          return;
        }
        if (!res.ok || d.ok !== true || typeof d.content !== "object" || d.content === null) {
          setState({
            status: "error",
            message: typeof d.error === "string" ? d.error : `加载失败（HTTP ${res.status}）`,
          });
          return;
        }
        setState({
          status: "ready",
          data: {
            content: normalizeContent(d.content),
            publishedAt: typeof d.publishedAt === "string" ? d.publishedAt : "",
          },
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "网络请求失败",
        });
      }
    })();
    return () => controller.abort();
  }, [id]);

  const content = state.status === "ready" ? state.data.content : null;

  function readScript() {
    if (!content) return [];
    return [
      { text: content.title },
      { text: `活动时间：${content.datetime}。活动地点：${content.location}。` },
      { text: `核心信息：${content.summaryPoints.filter(Boolean).join("。")}` },
      {
        text: `${content.visualAlt}。报名方式：${content.actionLabel || "报名链接"}，${
          content.actionUrl || content.contactInfo
        }`,
      },
    ];
  }

  const focusRing = highContrast
    ? "focus-visible:outline-amber"
    : "focus-visible:outline-cobalt";

  const toolbar = (
    <div
      role="toolbar"
      aria-label="无障碍辅助工具"
      className={cn(
        "sticky top-0 z-20 border-b px-4 py-3 backdrop-blur",
        highContrast ? "border-amber/40 bg-lights-off/95" : "border-line bg-paper/95",
      )}
    >
      <div className="mx-auto flex max-w-[720px] flex-wrap items-center gap-2">
        <a
          href="/"
          className={cn(
            "mr-auto rounded-full px-3 py-2 text-sm font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2",
            highContrast ? "text-amber" : "text-cobalt",
            focusRing,
          )}
        >
          ← 返回首页
        </a>
        <TactileButton
          aria-pressed={largeText}
          onClick={() => setLargeText((v) => !v)}
          className={cn(
            "px-4 py-2.5 text-sm",
            !largeText && "border-b-line bg-surface text-ink-soft shadow-none",
            highContrast && !largeText && "border-b-amber/40 bg-lights-off text-amber",
          )}
        >
          大字号
        </TactileButton>
        <TactileButton
          aria-pressed={highContrast}
          onClick={() => setHighContrast((v) => !v)}
          className={cn(
            "px-4 py-2.5 text-sm",
            !highContrast && "border-b-line bg-surface text-ink-soft shadow-none",
            highContrast && "border-b-amber/40 bg-lights-off text-amber",
          )}
        >
          黑底黄字
        </TactileButton>
        <TactileButton
          onClick={() => toggle(readScript())}
          disabled={!content || !supported}
          aria-label={speaking ? "停止语音播报" : "一键语音播报"}
          className={cn("px-4 py-2.5 text-sm", highContrast && "border-b-amber/40 bg-lights-off text-amber")}
        >
          {speaking ? (
            <Square aria-hidden="true" className="size-4" />
          ) : (
            <AudioLines aria-hidden="true" className="size-4" />
          )}
          {speaking ? "停止播报" : "语音播报"}
        </TactileButton>
      </div>
      {speaking && subtitle && (
        <p
          aria-live="polite"
          className={cn("mx-auto mt-2 max-w-[720px] text-xs", highContrast ? "text-amber" : "text-cobalt")}
        >
          正在朗读：{subtitle}
        </p>
      )}
    </div>
  );

  if (state.status === "loading") {
    return (
      <div className="min-h-dvh bg-paper">
        {toolbar}
        <main className="mx-auto max-w-[720px] px-4 py-16">
          <p role="status" aria-live="polite" className="flex items-center justify-center gap-2 text-sm text-ink-soft">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            正在加载无障碍通知…
          </p>
        </main>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="min-h-dvh bg-paper">
        {toolbar}
        <main className="mx-auto max-w-[720px] px-4 py-16">
          <div role="alert" className="rounded-tactile border border-warn-border bg-warn-bg p-6 text-center">
            <CircleAlert aria-hidden="true" className="mx-auto size-6 text-warn-fg" />
            <h1 className="mt-3 text-lg font-bold text-warn-fg">无法打开分享页</h1>
            <p className="mt-2 text-sm text-warn-fg">{state.message}</p>
            <a
              href="/"
              className="mt-4 inline-flex rounded-full border border-warn-border bg-surface px-4 py-2 text-sm font-semibold text-ink underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt"
            >
              返回首页
            </a>
          </div>
        </main>
      </div>
    );
  }

  const c = state.data.content;
  const points = c.summaryPoints.filter(Boolean);
  const sectionClass = (i: number) =>
    cn(
      "rounded-tactile border p-5 transition-all",
      highContrast ? "border-amber/30" : "border-line",
      index === i && (highContrast ? "border-amber bg-amber/10" : "border-cobalt bg-edited-bg"),
    );

  return (
    <div className={cn("min-h-dvh", highContrast ? "bg-lights-off" : "bg-paper")}>
      {toolbar}
      <main
        className={cn(
          "mx-auto max-w-[720px] px-4 py-8",
          highContrast ? "text-amber" : "text-ink",
          largeText ? "text-lg" : "text-sm",
        )}
      >
        <p
          className={cn(
            "inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold",
            highContrast ? "border-amber/50 text-amber" : "border-ok-border bg-ok-bg text-ok-fg",
          )}
        >
          经人工核对的无障碍通知
        </p>

        <section className={cn(sectionClass(0), "mt-4")}>
          <h1 className={cn("break-words font-bold", largeText ? "text-3xl" : "text-2xl")}>
            {c.title}
          </h1>
          {state.data.publishedAt && (
            <p className={cn("mt-2 text-xs", highContrast ? "text-amber/70" : "text-ink-soft")}>
              发布于 {new Date(state.data.publishedAt).toLocaleString("zh-CN")}
            </p>
          )}
        </section>

        <section className={cn(sectionClass(1), "mt-4")}>
          <h2 className={cn("font-semibold", largeText ? "text-xl" : "text-base")}>活动信息</h2>
          <dl className="mt-3 grid gap-3">
            <div>
              <dt className={cn("text-xs font-semibold", highContrast ? "text-amber/70" : "text-ink-soft")}>时间</dt>
              <dd className="mt-1 break-words">{c.datetime || "原件未提供"}</dd>
            </div>
            <div>
              <dt className={cn("text-xs font-semibold", highContrast ? "text-amber/70" : "text-ink-soft")}>地点</dt>
              <dd className="mt-1 break-words">{c.location || "原件未提供"}</dd>
            </div>
          </dl>
        </section>

        <section className={cn(sectionClass(2), "mt-4")}>
          <h2 className={cn("font-semibold", largeText ? "text-xl" : "text-base")}>核心信息</h2>
          {points.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {points.map((point, i) => (
                <li key={`${i}-${point}`} className="break-words">{point}</li>
              ))}
            </ul>
          ) : (
            <p className={cn("mt-3", highContrast ? "text-amber/70" : "text-ink-soft")}>原件未提供正文要点。</p>
          )}
        </section>

        <section className={cn(sectionClass(3), "mt-4")}>
          <h2 className={cn("font-semibold", largeText ? "text-xl" : "text-base")}>视觉与报名</h2>
          {c.visualAlt && <p className="mt-3 break-words">{c.visualAlt}</p>}
          {c.actionGuide && <p className="mt-2 break-words">{c.actionGuide}</p>}
          {c.actionUrl.trim() && (
            <p className="mt-3">
              <a
                href={c.actionUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2",
                  highContrast ? "text-amber focus-visible:outline-amber" : "text-cobalt focus-visible:outline-cobalt",
                )}
              >
                {c.actionLabel || "打开报名链接"}
              </a>
            </p>
          )}
          {c.contactInfo.trim() && (
            <p className="mt-2 break-words">备用联系方式：{c.contactInfo}</p>
          )}
        </section>
      </main>
    </div>
  );
}