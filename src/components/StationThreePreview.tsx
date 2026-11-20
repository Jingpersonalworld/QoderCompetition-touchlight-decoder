import { useEffect, useRef, useState, type ReactNode } from "react";
import { AudioLines, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { TactileButton } from "@/components/ui/TactileButton";
import { TactileCard } from "@/components/ui/TactileCard";

const RESULT = {
  title: "2026 校园无障碍设计开放麦",
  time: "2026-11-21（周六）19:00–21:00",
  place: "大学生活动中心 302 · 无障碍报告厅",
  points: [
    "无障碍设计案例分享与现场体验",
    "读屏与触觉标识工作坊分组共创",
    "开放麦自由发言，欢迎所有专业同学",
  ],
  actionLabel: "打开开放麦报名表",
  actionUrl: "https://example.com/openmic",
  contact: "access@club.example.edu",
};

const READ_TEXT = [
  RESULT.title,
  `时间：${RESULT.time}`,
  `地点：${RESULT.place}`,
  `正文要点：${RESULT.points.join("。")}`,
  `报名指引：${RESULT.actionLabel}，备用联系 ${RESULT.contact}`,
].join("。");

function useSpeech() {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);
  const stopped = useRef(false);

  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  function stop() {
    stopped.current = true;
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  function toggle() {
    if (!supported) return;
    if (speaking) {
      stop();
      return;
    }
    window.speechSynthesis.cancel();
    stopped.current = false;
    const utterance = new SpeechSynthesisUtterance(READ_TEXT);
    utterance.lang = "zh-CN";
    const finish = () => {
      if (!stopped.current) setSpeaking(false);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  return { supported, speaking, toggle };
}

function SamplePoster() {
  return (
    <figure
      className="m-0"
      aria-label="内置示例海报：2026 校园无障碍设计开放麦，纯图片示意，缺少替代文本与语义结构"
    >
      <div className="overflow-hidden rounded-tactile border border-line shadow-[var(--tl-card-shadow)]">
        <svg viewBox="0 0 300 400" className="block w-full" aria-hidden="true">
          <defs>
            <linearGradient id="s3-poster" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1D4ED8" />
              <stop offset="0.55" stopColor="#7A5AF8" />
              <stop offset="1" stopColor="#E5A00D" />
            </linearGradient>
          </defs>
          <rect width="300" height="400" fill="url(#s3-poster)" />
          <circle cx="255" cy="55" r="72" fill="#FFFDF9" opacity="0.12" />
          <circle cx="35" cy="345" r="92" fill="#111418" opacity="0.16" />
          <g transform="rotate(-5 150 105)">
            <text
              x="150"
              y="92"
              textAnchor="middle"
              fontSize="27"
              fontWeight="900"
              fill="#FFFDF9"
              stroke="#111418"
              strokeWidth="0.8"
            >
              2026 校园无障碍
            </text>
            <text
              x="150"
              y="130"
              textAnchor="middle"
              fontSize="26"
              fontWeight="900"
              fill="#FFE600"
              stroke="#111418"
              strokeWidth="0.8"
            >
              设计开放麦
            </text>
          </g>
          <text x="30" y="205" fontSize="19" fontWeight="700" fill="#FFFDF9">
            11/21 周六 19:00
          </text>
          <text x="30" y="240" fontSize="15" fontWeight="600" fill="#FFFDF9">
            大学生活动中心 302
          </text>
          <text x="30" y="272" fontSize="13" fill="#FFFDF9" opacity="0.9">
            分享 · 体验 · 共创
          </text>
          <g transform="translate(212 302)">
            <rect width="68" height="68" fill="#FFFDF9" />
            <rect x="6" y="6" width="17" height="17" fill="#111418" />
            <rect x="45" y="6" width="17" height="17" fill="#111418" />
            <rect x="6" y="45" width="17" height="17" fill="#111418" />
            <rect x="29" y="29" width="8" height="8" fill="#111418" />
            <rect x="45" y="33" width="8" height="8" fill="#111418" />
            <rect x="33" y="47" width="8" height="8" fill="#111418" />
            <rect x="50" y="50" width="12" height="12" fill="#111418" />
          </g>
        </svg>
      </div>
      <figcaption className="mt-2 text-xs text-ink-soft">
        纯图片海报 · 缺少 alt 与语义结构（困境示意）
      </figcaption>
    </figure>
  );
}

function Block({
  kicker,
  delay,
  reduced,
  children,
}: {
  kicker: string;
  delay: number;
  reduced: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-tactile border border-line bg-paper p-4",
        !reduced && "tl-rise",
      )}
      style={reduced ? undefined : { animationDelay: `${delay}ms` }}
    >
      <p className="font-mono text-xs text-ink-soft">{kicker}</p>
      <div className="mt-1">{children}</div>
    </section>
  );
}

export function StationThreePreview({ onAdvance }: { onAdvance: () => void }) {
  const [done, setDone] = useState(false);
  const [reduced, setReduced] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { supported, speaking, toggle } = useSpeech();

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (done) titleRef.current?.focus();
  }, [done]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <TactileCard>
        <p className="font-mono text-xs text-ink-soft">第 3 站 · 数字盲道</p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-ink">
          前两站看到了物理世界的触觉与图形密码；在数字世界里，一张纯图片海报同样可能成为视障者的“数字盲道断头路”。
        </h2>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-edge bg-amber px-3 py-1 text-xs font-semibold text-on-amber">
          内置示例 · 本地样本预演
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          本关展示的是静态预设样例，不请求任何模型；下一步可到 04 译码台体验完整的样例核对流程。
        </p>
      </TactileCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TactileCard className="flex flex-col gap-4">
          <p className="text-sm font-bold text-ink">未做无障碍处理的纯图片海报</p>
          <SamplePoster />
          <p className="rounded-tactile border border-warn-border bg-warn-bg p-4 text-xs text-warn-fg">
            当信息只存在于图片像素中且缺少替代文本（alt）与语义结构时，读屏软件往往只能识别为未命名图像，无法读取时间、地点与报名入口。
          </p>
          <TactileButton onClick={() => setDone(true)} className="w-full">
            演示 AI 语义重译（内置示例）
          </TactileButton>
        </TactileCard>

        <TactileCard className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-ink">语义重译后的结构化文字页</p>
            <TactileButton
              onClick={toggle}
              disabled={!done || !supported}
              className={cn(
                "px-3 py-1.5 text-xs",
                !speaking && "border-b-line bg-surface text-ink-soft shadow-none",
              )}
            >
              {speaking ? (
                <Square aria-hidden="true" className="size-3.5" />
              ) : (
                <AudioLines aria-hidden="true" className="size-3.5" />
              )}
              {speaking ? "停止试听" : "试听这段重译结果"}
            </TactileButton>
          </div>

          <p role="status" aria-live="polite" className="text-xs text-ok-fg">
            {done ? "已生成内置示例重译结果，共 5 个语义区块。" : ""}
          </p>

          {!done ? (
            <p className="rounded-tactile border-2 border-dashed border-line bg-paper p-8 text-center text-sm text-ink-soft">
              点击「演示 AI 语义重译（内置示例）」，查看同一张海报对应的结构化文字重译结果。
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <Block kicker="活动标题" delay={0} reduced={reduced}>
                <h3
                  ref={titleRef}
                  tabIndex={-1}
                  className="text-lg font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt"
                >
                  {RESULT.title}
                </h3>
              </Block>
              <Block kicker="时间" delay={80} reduced={reduced}>
                <p className="text-sm text-ink">{RESULT.time}</p>
              </Block>
              <Block kicker="地点" delay={160} reduced={reduced}>
                <p className="text-sm text-ink">{RESULT.place}</p>
              </Block>
              <Block kicker="正文要点" delay={240} reduced={reduced}>
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                  {RESULT.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </Block>
              <Block kicker="报名指引" delay={320} reduced={reduced}>
                <p className="text-sm">
                  <a
                    href={RESULT.actionUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-cobalt underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt"
                  >
                    {RESULT.actionLabel}
                  </a>
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  备用联系：{RESULT.contact}
                </p>
              </Block>
            </div>
          )}
        </TactileCard>
      </div>

      <TactileButton onClick={onAdvance} className="w-full">
        前往 04 AI 译码台，体验核对流程 →
      </TactileButton>
    </div>
  );
}