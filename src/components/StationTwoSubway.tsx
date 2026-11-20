import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { TactileButton } from "@/components/ui/TactileButton";
import { TactileCard } from "@/components/ui/TactileCard";

type Badge = "circle" | "triangle" | "diamond";

const LINES: {
  n: number;
  color: string;
  d: string;
  dash?: string;
  badge: Badge;
  bx: number;
  by: number;
  style: string;
  shape: string;
}[] = [
  {
    n: 1,
    color: "#D64545",
    d: "M100 320 L360 210 L620 100",
    badge: "circle",
    bx: 230,
    by: 265,
    style: "实线",
    shape: "● 圆形",
  },
  {
    n: 2,
    color: "#2F9E63",
    d: "M100 100 L360 210 L620 320",
    dash: "18 10",
    badge: "triangle",
    bx: 490,
    by: 265,
    style: "长虚线",
    shape: "▲ 三角",
  },
  {
    n: 3,
    color: "#E8842C",
    d: "M360 60 L360 210 L360 360",
    dash: "14 8 3 8",
    badge: "diamond",
    bx: 360,
    by: 135,
    style: "点划线",
    shape: "◆ 菱形",
  },
];

const STATIONS = [
  { x: 100, y: 320, name: "大学城", tx: 100, ty: 348, anchor: "middle" },
  { x: 620, y: 100, name: "东湖码头", tx: 620, ty: 78, anchor: "middle" },
  { x: 100, y: 100, name: "北岭", tx: 100, ty: 78, anchor: "middle" },
  { x: 620, y: 320, name: "市图书馆", tx: 620, ty: 348, anchor: "middle" },
  { x: 360, y: 60, name: "市民公园", tx: 360, ty: 38, anchor: "middle" },
  { x: 360, y: 360, name: "南湾", tx: 360, ty: 388, anchor: "middle" },
  { x: 360, y: 210, name: "中心广场", tx: 378, ty: 214, anchor: "start" },
] as const;

const OPTIONS = [
  {
    id: 1,
    correct: true,
    text: "从【大学城】乘 1号线（● 实线）到【中心广场】，换乘 2号线（▲ 长虚线）前往【市图书馆】",
  },
  {
    id: 2,
    correct: false,
    text: "从【大学城】乘 1号线（● 实线）到【中心广场】，换乘 3号线（◆ 点划线）前往【市图书馆】",
  },
  {
    id: 3,
    correct: false,
    text: "从【大学城】直接沿原线坐到底",
  },
];

const CVD_MATRIX =
  "0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0";

function BadgeShape({ badge, x, y }: { badge: Badge; x: number; y: number }) {
  const common = { fill: "#FFFDF9", stroke: "#1E242B", strokeWidth: 2 };
  if (badge === "circle") return <circle cx={x} cy={y} r={11} {...common} />;
  if (badge === "triangle")
    return <path d={`M${x} ${y - 11} L${x + 11} ${y + 9} L${x - 11} ${y + 9} Z`} {...common} />;
  return (
    <path
      d={`M${x} ${y - 11} L${x + 11} ${y} L${x} ${y + 11} L${x - 11} ${y} Z`}
      {...common}
    />
  );
}

function TactileSwitch({
  id,
  checked,
  onChange,
  label,
  caption,
  switchRef,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  caption?: string;
  switchRef?: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-tactile border border-line bg-surface p-4">
      <button
        ref={switchRef}
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-8 w-14 shrink-0 rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
          checked ? "border-amber-edge bg-amber" : "border-line bg-paper",
        )}
      >
        <span
          className={cn(
            "absolute left-1 top-1 size-6 rounded-full bg-surface shadow-[0_1px_3px_rgba(30,36,43,0.3)] transition-transform",
            checked && "translate-x-6",
          )}
        />
      </button>
      <span className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-semibold text-ink">
          {label}
        </label>
        {caption && (
          <span className="mt-0.5 block text-xs text-ink-soft">{caption}</span>
        )}
      </span>
    </div>
  );
}

export function StationTwoSubway({ onAdvance }: { onAdvance: () => void }) {
  const [cvd, setCvd] = useState(false);
  const [encoding, setEncoding] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const resultRef = useRef<HTMLHeadingElement>(null);
  const encodingSwitchRef = useRef<HTMLButtonElement | null>(null);
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (revealed) resultRef.current?.focus();
  }, [revealed]);

  function reset() {
    setCvd(false);
    setEncoding(false);
    setSelected(null);
    setRevealed(false);
    encodingSwitchRef.current?.focus();
  }

  function onRadioKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + OPTIONS.length) % OPTIONS.length;
    setSelected(OPTIONS[next].id);
    radioRefs.current[next]?.focus();
  }

  const chosen = OPTIONS.find((o) => o.id === selected);
  const correct = chosen?.correct ?? false;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <TactileCard>
        <p className="font-mono text-xs text-ink-soft">第 2 站 · 错位路口</p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-ink">
          你现在在【大学城站】，需要换乘 1 次前往【市图书馆站】。
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          试着先打开“红绿色盲视角（示意）”，感受仅靠颜色区分线路时的困扰，再开启通用编码开关完成换乘选择。
        </p>
      </TactileCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TactileSwitch
          id="sw-cvd"
          checked={cvd}
          onChange={setCvd}
          label="红绿色盲视觉模拟（示意）"
          caption="此滤镜为红绿色盲视觉效果示意"
        />
        <TactileSwitch
          id="sw-encoding"
          checked={encoding}
          onChange={(v) => {
            setEncoding(v);
            if (!v) {
              setSelected(null);
              setRevealed(false);
            }
          }}
          label="开启通用图形符号 + 线型编码"
          caption="叠加线型、几何徽标与文字线号，色盲滤镜下依然可读"
          switchRef={(el) => {
            encodingSwitchRef.current = el;
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
        <TactileCard className="p-4">
          <svg
            viewBox="0 0 720 420"
            className="block h-auto w-full"
            role="img"
            aria-label="虚构简化地铁地图：三条线路在中心广场交汇"
          >
            <defs>
              <filter id="cvd-sim">
                <feColorMatrix type="matrix" values={CVD_MATRIX} />
              </filter>
            </defs>

            {revealed && (
              <path
                d="M100 320 L360 210 L620 320"
                fill="none"
                stroke="#1D4ED8"
                strokeWidth={14}
                strokeLinecap="round"
                opacity={0.28}
              />
            )}

            <g filter={cvd ? "url(#cvd-sim)" : undefined}>
              {LINES.map((line) => (
                <path
                  key={line.n}
                  d={line.d}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeDasharray={encoding ? line.dash : undefined}
                />
              ))}
              {encoding &&
                LINES.map((line) => (
                  <BadgeShape key={line.n} badge={line.badge} x={line.bx} y={line.by} />
                ))}
            </g>

            {STATIONS.map((s) => (
              <circle
                key={s.name}
                cx={s.x}
                cy={s.y}
                r={s.name === "中心广场" ? 10 : 7}
                fill="#FFFDF9"
                stroke="#1E242B"
                strokeWidth={2.5}
              />
            ))}
            {STATIONS.map((s) => (
              <text
                key={s.name}
                x={s.tx}
                y={s.ty}
                textAnchor={s.anchor}
                className="subway-label"
                fontWeight={600}
                fill="#1E242B"
              >
                {s.name}
              </text>
            ))}
            {encoding &&
              LINES.map((line) => (
                <text
                  key={line.n}
                  x={line.bx + 18}
                  y={line.by + 5}
                  className="subway-label"
                  fontWeight={700}
                  fill="#1E242B"
                >
                  {line.n}号线
                </text>
              ))}
          </svg>
        </TactileCard>

        <TactileCard>
          <p className="text-sm font-bold text-ink">等价文字路线线索</p>
          <ul aria-live="polite" className="mt-3 space-y-2 text-sm text-ink">
            {encoding ? (
              LINES.map((line) => (
                <li key={line.n}>
                  <span className="font-semibold">
                    {line.n}号线（{line.shape} / {line.style}）：
                  </span>
                  {line.n === 1 && "大学城 → 中心广场"}
                  {line.n === 2 && "中心广场 → 市图书馆"}
                  {line.n === 3 && "中心广场 → 市民公园"}
                </li>
              ))
            ) : (
              <li className="text-ink-soft">
                当前仅使用颜色区分三条线路（起点大学城位于红色实线，中心广场可换乘另外两条实线，未标注线号与形状）。
              </li>
            )}
          </ul>
        </TactileCard>
      </div>

      {!encoding ? (
        <TactileCard className="border-dashed">
          <p className="text-sm text-ink-soft">
            开启「通用图形符号 + 线型编码」后，这里会出现 3 个换乘方案供你选择；也可以先打开色盲模拟感受仅靠颜色的困扰。
          </p>
        </TactileCard>
      ) : !revealed ? (
        <TactileCard>
          <p className="text-sm font-bold text-ink">选择你的换乘方案</p>
          <div
            role="radiogroup"
            aria-label="换乘方案"
            className="mt-3 flex flex-col gap-3"
          >
            {OPTIONS.map((option, i) => (
              <button
                key={option.id}
                ref={(el) => {
                  radioRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={selected === option.id}
                tabIndex={
                  selected === null ? (i === 0 ? 0 : -1) : selected === option.id ? 0 : -1
                }
                onClick={() => setSelected(option.id)}
                onKeyDown={(e) => onRadioKey(e, i)}
                className={cn(
                  "tactile-card w-full p-4 text-left text-sm text-ink transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
                  selected === option.id &&
                    "border-cobalt shadow-[0_0_0_2px_#1D4ED8,0_4px_14px_rgba(30,36,43,0.06)]",
                )}
              >
                <span className="font-mono text-xs text-ink-soft">
                  方案 {option.id}
                </span>
                <span className="mt-1 block">{option.text}</span>
              </button>
            ))}
          </div>
          <TactileButton
            onClick={() => setRevealed(true)}
            disabled={selected === null}
            className="mt-4"
          >
            提交换乘方案
          </TactileButton>
        </TactileCard>
      ) : (
        <TactileCard>
          <h2
            ref={resultRef}
            tabIndex={-1}
            className={cn(
              "rounded-tactile border px-4 py-3 text-lg font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
              correct
                ? "border-ok-border bg-ok-bg text-ok-fg"
                : "border-warn-border bg-warn-bg text-warn-fg",
            )}
          >
            {correct
              ? "选对了！方案 1 正确到达【市图书馆】。"
              : `选错了：你选了方案 ${selected}，正确答案是方案 1。`}
          </h2>
          <p className="mt-4 text-sm text-ink">
            颜色之外的图形符号、纹理线型与文字标注，才是每个人都能看懂的通用设计。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <TactileButton onClick={reset}>再试一轮</TactileButton>
            <TactileButton
              onClick={onAdvance}
              className="border-b-line bg-surface text-ink shadow-none"
            >
              前往第 3 站
            </TactileButton>
          </div>
        </TactileCard>
      )}
    </div>
  );
}