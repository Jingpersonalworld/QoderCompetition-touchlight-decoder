import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { BrailleHeader, STAGES, type StageId } from "@/components/BrailleHeader";
import { DecoderWorkbench } from "@/components/DecoderWorkbench";
import { StationOneBlackout } from "@/components/StationOneBlackout";
import { StationTwoSubway } from "@/components/StationTwoSubway";
import { StationThreePreview } from "@/components/StationThreePreview";

type Health =
  | { status: "loading" }
  | { status: "ok"; timestamp: string }
  | { status: "error"; reason: string };

function HealthBadge() {
  const [health, setHealth] = useState<Health>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/functions/v1/app/health", {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: unknown = await res.json();
        if (
          typeof data !== "object" ||
          data === null ||
          !("ok" in data) ||
          data.ok !== true ||
          !("service" in data) ||
          data.service !== "touchlight-decoder" ||
          !("timestamp" in data) ||
          typeof data.timestamp !== "string"
        ) {
          throw new Error("返回内容不符合 health 契约");
        }
        setHealth({ status: "ok", timestamp: data.timestamp });
      } catch (err) {
        if (controller.signal.aborted) return;
        setHealth({
          status: "error",
          reason: err instanceof Error ? err.message : "请求失败",
        });
      }
    })();
    return () => controller.abort();
  }, []);

  const Icon =
    health.status === "ok"
      ? CircleCheck
      : health.status === "error"
        ? CircleAlert
        : LoaderCircle;

  return (
    <p
      role="status"
      aria-live="polite"
      className={
        health.status === "error"
          ? "inline-flex items-center gap-2 rounded-full border border-warn-border bg-warn-bg px-3 py-1 text-xs text-warn-fg"
          : "inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-soft"
      }
    >
      <Icon
        aria-hidden="true"
        className={
          health.status === "loading"
            ? "size-3.5 animate-spin"
            : "size-3.5 shrink-0"
        }
      />
      {health.status === "loading" && "正在检测云函数…"}
      {health.status === "ok" && (
        <>
          云函数已就绪
          <span className="font-mono opacity-70">{health.timestamp}</span>
        </>
      )}
      {health.status === "error" && `云函数未就绪：${health.reason}`}
    </p>
  );
}

export default function App() {
  const [stage, setStage] = useState<StageId>(STAGES[0].id);

  return (
    <div className="min-h-dvh bg-paper">
      <BrailleHeader activeStage={stage} onSelect={setStage} />

      <main className="mx-auto max-w-[1280px] px-6 py-8">
        <HealthBadge />

        {stage === "04" ? (
          <div
            id="stage-panel-04"
            role="region"
            aria-labelledby="stage-tab-04"
            className="mt-6"
          >
            <DecoderWorkbench />
          </div>
        ) : stage === "01" ? (
          <div
            id="stage-panel-01"
            role="region"
            aria-labelledby="stage-tab-01"
            className="mt-6"
          >
            <StationOneBlackout onAdvance={() => setStage("02")} />
          </div>
        ) : stage === "02" ? (
          <div
            id="stage-panel-02"
            role="region"
            aria-labelledby="stage-tab-02"
            className="mt-6"
          >
            <StationTwoSubway onAdvance={() => setStage("03")} />
          </div>
        ) : (
          <div
            id="stage-panel-03"
            role="region"
            aria-labelledby="stage-tab-03"
            className="mt-6"
          >
            <StationThreePreview onAdvance={() => setStage("04")} />
          </div>
        )}
      </main>
    </div>
  );
}