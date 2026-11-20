import { useEffect, useRef, useState, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { TactileButton } from "@/components/ui/TactileButton";
import { TactileCard } from "@/components/ui/TactileCard";

type Side = "left" | "right";
type Phase = "intro" | "blackout" | "reveal";
type Texture = "ridge" | "smooth";

interface Ripple {
  id: number;
  x: number;
  y: number;
  kind: Texture;
}

const VIEW_W = 800;
const VIEW_H = 360;
const CENTER: Record<Side, number> = { left: 200, right: 600 };
const BAND: Record<Side, { x: number; y: number; w: number; h: number }> = {
  left: { x: 230, y: 120, w: 80, h: 190 },
  right: { x: 630, y: 120, w: 80, h: 190 },
};
const SIDE_LABEL: Record<Side, string> = { left: "左瓶", right: "右瓶" };

function ridgePath(cx: number): string {
  let d = `M ${cx + 60} 140`;
  for (let y = 140; y < 300; y += 12) {
    d += ` L ${cx + 68} ${y + 6} L ${cx + 60} ${y + 12}`;
  }
  return d;
}

function Bottle({ cx, ridged, lit }: { cx: number; ridged: boolean; lit: boolean }) {
  const body = `M ${cx - 60} 130 Q ${cx - 60} 110 ${cx - 40} 105 L ${cx - 18} 98 L ${cx - 18} 70 L ${cx + 18} 70 L ${cx + 18} 98 L ${cx + 40} 105 Q ${cx + 60} 110 ${cx + 60} 130 L ${cx + 60} 300 Q ${cx + 60} 320 ${cx + 40} 320 L ${cx - 40} 320 Q ${cx - 60} 320 ${cx - 60} 300 Z`;
  return (
    <g>
      <rect
        x={cx - 22}
        y={40}
        width={44}
        height={30}
        rx={6}
        fill={lit ? "#E5A00D" : "#1a2027"}
        stroke={lit ? "#1E242B" : "#242b34"}
        strokeWidth={2}
      />
      <path
        d={body}
        fill={lit ? "#FFFDF9" : "#151a20"}
        stroke={lit ? "#1E242B" : "#242b34"}
        strokeWidth={lit ? 2.5 : 2}
      />
      {ridged ? (
        <path
          d={ridgePath(cx)}
          fill="none"
          stroke={lit ? "#E5A00D" : "#2a323c"}
          strokeWidth={lit ? 3 : 2}
          strokeLinejoin="round"
        />
      ) : (
        <line
          x1={cx + 60}
          y1={140}
          x2={cx + 60}
          y2={300}
          stroke={lit ? "#1D4ED8" : "#2a323c"}
          strokeWidth={lit ? 3 : 2}
          opacity={lit ? 0.7 : 1}
        />
      )}
      {lit && (
        <text
          x={cx}
          y={348}
          textAnchor="middle"
          fontSize={15}
          fontWeight={700}
          fill="#1E242B"
        >
          {ridged ? "洗发水 · 锯齿横棱" : "护发素 · 光滑瓶身"}
        </text>
      )}
    </g>
  );
}

function waveform(texture: Texture | "idle"): number[] {
  return Array.from({ length: 28 }, (_, i) => {
    if (texture === "ridge") return i % 2 === 0 ? 18 : 7;
    if (texture === "smooth") return 6;
    return 3;
  });
}

export function StationOneBlackout({ onAdvance }: { onAdvance: () => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [shampooSide, setShampooSide] = useState<Side>(() =>
    Math.random() < 0.5 ? "left" : "right",
  );
  const [choice, setChoice] = useState<Side | null>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const [texture, setTexture] = useState<Texture | "idle">("idle");
  const [announce, setAnnounce] = useState("");
  const [probeHighlight, setProbeHighlight] = useState<Side | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [reduced, setReduced] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const probeLeftRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const rippleId = useRef(0);
  const lastPointer = useRef<Record<Side, number>>({ left: 0, right: 0 });
  const highlightTimer = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const audioSupported =
    typeof window !== "undefined" && "AudioContext" in window;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (phase === "blackout") probeLeftRef.current?.focus();
    if (phase === "reveal") resultRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    return () => {
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
      audioRef.current?.close();
    };
  }, []);

  function playTick(kind: Texture) {
    const ctx = audioRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (kind === "ridge") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(1900, now);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.07);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.linearRampToValueAtTime(340, now + 0.12);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  }

  function toggleSound() {
    setSoundOn((prev) => {
      const next = !prev;
      if (next && audioSupported) {
        if (!audioRef.current) audioRef.current = new AudioContext();
        if (audioRef.current.state === "suspended") void audioRef.current.resume();
      }
      return next;
    });
  }

  function feedback(side: Side, kind: Texture, x: number, y: number) {
    setTexture(kind);
    setAnnounce(
      kind === "ridge"
        ? `${SIDE_LABEL[side]}侧面：检测到连续锯齿横棱，阻尼感明显`
        : `${SIDE_LABEL[side]}侧面：表面完全光滑，无凸起纹理`,
    );
    if (!reduced) {
      rippleId.current += 1;
      const id = rippleId.current;
      setRipples((prev) => [...prev.slice(-5), { id, x, y, kind }]);
    }
    setProbeHighlight(side);
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setProbeHighlight(null), 800);
    if (kind === "ridge" && typeof navigator.vibrate === "function") {
      navigator.vibrate(12);
    }
    if (soundOn) playTick(kind);
  }

  function begin() {
    setShampooSide(Math.random() < 0.5 ? "left" : "right");
    setChoice(null);
    setRipples([]);
    setRing(null);
    setTexture("idle");
    setAnnounce("");
    setProbeHighlight(null);
    lastPointer.current = { left: 0, right: 0 };
    setPhase("blackout");
  }

  function hitSide(vbX: number, vbY: number): Side | null {
    for (const side of ["left", "right"] as Side[]) {
      const b = BAND[side];
      if (vbX >= b.x && vbX <= b.x + b.w && vbY >= b.y && vbY <= b.y + b.h) {
        return side;
      }
    }
    return null;
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (phase !== "blackout") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setRing({ x: px, y: py });
    const vbX = (px / rect.width) * VIEW_W;
    const vbY = (py / rect.height) * VIEW_H;
    const side = hitSide(vbX, vbY);
    if (!side) return;
    const now = performance.now();
    if (now - lastPointer.current[side] < 260) return;
    lastPointer.current[side] = now;
    feedback(side, shampooSide === side ? "ridge" : "smooth", px, py);
  }

  function probe(side: Side) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const b = BAND[side];
    const x = ((b.x + b.w / 2) / VIEW_W) * rect.width;
    const y = ((b.y + b.h / 2) / VIEW_H) * rect.height;
    feedback(side, shampooSide === side ? "ridge" : "smooth", x, y);
  }

  function choose(side: Side) {
    setChoice(side);
    setRing(null);
    setPhase("reveal");
  }

  const correct = choice !== null && choice === shampooSide;
  const lit = phase === "reveal";
  const bars = waveform(texture);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {phase === "intro" && (
        <TactileCard>
          <p className="font-mono text-xs text-ink-soft">第 1 站 · 熄灯摸物</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink">
            熄灯后，用指尖或键盘探测两只瓶身侧面的触觉编码，找出哪一瓶是洗发水。
          </h2>
          <p className="mt-2 text-sm text-ink-soft">
            扫描环划过瓶身侧面时会给出波纹与触感波形反馈；也可以完全用键盘探测后作答。
          </p>
          <TactileButton onClick={begin} className="mt-6">
            熄灯开始探测
          </TactileButton>
        </TactileCard>
      )}

      {phase !== "intro" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-tactile border border-line bg-surface px-4 py-3">
            <div
              role="status"
              aria-live="polite"
              className="flex min-w-0 items-center gap-3"
            >
              <span aria-hidden="true" className="flex items-end gap-[2px]">
                {bars.map((h, i) => (
                  <span
                    key={i}
                    className={cn(
                      "w-[3px] rounded-full transition-all",
                      texture === "ridge"
                        ? "bg-amber"
                        : texture === "smooth"
                          ? "bg-cobalt"
                          : "bg-line",
                    )}
                    style={{ height: `${h}px` }}
                  />
                ))}
              </span>
              <span className="min-w-0 text-xs text-ink-soft">
                {announce ||
                  (phase === "blackout"
                    ? "等待探测：将指尖或键盘焦点移到瓶身侧面"
                    : "探测结束")}
              </span>
            </div>
            {phase === "blackout" && (
              <TactileButton
                aria-pressed={soundOn}
                onClick={toggleSound}
                disabled={!audioSupported}
                className={cn(
                  "px-3 py-1.5 text-xs",
                  !soundOn && "border-b-line bg-surface text-ink-soft shadow-none",
                )}
              >
                {soundOn ? "关闭触觉提示音" : "开启触觉提示音"}
              </TactileButton>
            )}
          </div>

          <div
            ref={canvasRef}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setRing(null)}
            onPointerUp={(e) => {
              if (e.pointerType !== "mouse") setRing(null);
            }}
            className={cn(
              "relative overflow-hidden rounded-tactile border transition-colors duration-700",
              lit ? "border-line bg-paper" : "border-[#242b34] bg-lights-off",
            )}
            style={{ aspectRatio: `${VIEW_W}/${VIEW_H}`, touchAction: "pan-y" }}
          >
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="block h-full w-full"
              aria-hidden="true"
            >
              <Bottle cx={CENTER.left} ridged={shampooSide === "left"} lit={lit} />
              <Bottle cx={CENTER.right} ridged={shampooSide === "right"} lit={lit} />
              {probeHighlight && (
                <rect
                  x={BAND[probeHighlight].x - 4}
                  y={BAND[probeHighlight].y - 6}
                  width={BAND[probeHighlight].w + 8}
                  height={BAND[probeHighlight].h + 12}
                  rx={8}
                  fill="none"
                  stroke="#1D4ED8"
                  strokeWidth={3}
                />
              )}
            </svg>

            {phase === "blackout" &&
              !reduced &&
              ripples.map((r) => (
                <span
                  key={r.id}
                  onAnimationEnd={() =>
                    setRipples((prev) => prev.filter((p) => p.id !== r.id))
                  }
                  className={cn(
                    "pointer-events-none absolute size-24 rounded-full border-2",
                    r.kind === "ridge"
                      ? "so-ripple-ridge border-amber shadow-[0_0_24px_rgba(229,160,13,0.35)]"
                      : "so-ripple-smooth border-cobalt/50",
                  )}
                  style={{ left: r.x, top: r.y }}
                />
              ))}

            {phase === "blackout" && ring && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber/60 bg-[radial-gradient(circle,rgba(229,160,13,0.18),transparent_70%)] shadow-[0_0_24px_rgba(229,160,13,0.25)]"
                style={{ left: ring.x, top: ring.y }}
              />
            )}
          </div>

          {phase === "blackout" && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TactileButton ref={probeLeftRef} onClick={() => probe("left")}>
                  探测左瓶侧面
                </TactileButton>
                <TactileButton onClick={() => probe("right")}>
                  探测右瓶侧面
                </TactileButton>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TactileButton
                  onClick={() => choose("left")}
                  className="border-b-line bg-surface text-ink shadow-none"
                >
                  选择左瓶为洗发水
                </TactileButton>
                <TactileButton
                  onClick={() => choose("right")}
                  className="border-b-line bg-surface text-ink shadow-none"
                >
                  选择右瓶为洗发水
                </TactileButton>
              </div>
            </>
          )}

          {phase === "reveal" && (
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
                  ? `猜对了！${SIDE_LABEL[shampooSide]}是洗发水。`
                  : `猜错了：${SIDE_LABEL[shampooSide]}才是洗发水，你选的是${SIDE_LABEL[choice as Side]}。`}
              </h2>
              <p className="mt-4 text-sm text-ink">
                这是通过屏幕波纹与声光反馈模拟的触觉体验。
              </p>
              <p className="mt-2 text-sm text-ink-soft">
                部分洗护品牌会在洗发水瓶身侧面或肩部加入锯齿、横棱等触觉标识，帮助视障者或闭眼洗漱时与光滑的护发素瓶区分。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <TactileButton onClick={begin}>再试一轮（重新随机）</TactileButton>
                <TactileButton
                  onClick={onAdvance}
                  className="border-b-line bg-surface text-ink shadow-none"
                >
                  前往第 2 站
                </TactileButton>
              </div>
            </TactileCard>
          )}
        </>
      )}
    </div>
  );
}