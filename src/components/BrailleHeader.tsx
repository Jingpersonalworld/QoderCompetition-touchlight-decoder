import { cn } from "@/lib/utils";
import { TactileButton } from "@/components/ui/TactileButton";

export const STAGES = [
  { id: "01", label: "熄灯摸物" },
  { id: "02", label: "错位路口" },
  { id: "03", label: "数字盲道" },
  { id: "04", label: "AI 译码台" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

/** 装饰性 6 点盲文单元格，列优先：左列 1-2-3，右列 4-5-6。 */
const BRAILLE_DOTS = [true, false, true, true, true, false];

interface BrailleHeaderProps {
  activeStage: StageId;
  onSelect: (stage: StageId) => void;
}

export function BrailleHeader({ activeStage, onSelect }: BrailleHeaderProps) {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid grid-cols-2 grid-rows-3 gap-[3px]"
          >
            {BRAILLE_DOTS.map((filled, i) => (
              <span
                key={i}
                className={cn(
                  "size-[7px] rounded-full",
                  filled ? "bg-amber" : "bg-line",
                )}
              />
            ))}
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-bold tracking-tight text-ink">
              触光译码
            </span>
            <span className="block text-xs text-ink-soft">
              城市无障碍解码局
            </span>
          </span>
        </div>

        <nav
          aria-label="关卡阶段"
          className="ml-auto flex flex-wrap items-center gap-2"
        >
          {STAGES.map((stage) => {
            const active = stage.id === activeStage;
            return (
              <TactileButton
                key={stage.id}
                id={`stage-tab-${stage.id}`}
                aria-pressed={active}
                aria-controls={`stage-panel-${stage.id}`}
                onClick={() => onSelect(stage.id)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs",
                  !active && "border-b-line bg-surface text-ink-soft shadow-none",
                )}
              >
                <span className="font-mono opacity-70">{stage.id}</span>
                {stage.label}
              </TactileButton>
            );
          })}
        </nav>
      </div>
    </header>
  );
}