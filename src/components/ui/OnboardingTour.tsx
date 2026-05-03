import { useState } from "react";
import { useT } from "../../lib/i18n";
import {
  GameController,
  Sidebar as SidebarIcon,
  MagnifyingGlass,
  Wrench,
  Rocket,
} from "@phosphor-icons/react";

interface OnboardingTourProps {
  onComplete: () => void;
}

const STEPS = [
  { icon: GameController, titleKey: "onboarding.welcome", descKey: "onboarding.welcome.desc", color: "text-repressurizer-accent" },
  { icon: SidebarIcon, titleKey: "onboarding.sidebar", descKey: "onboarding.sidebar.desc", color: "text-sky-400" },
  { icon: MagnifyingGlass, titleKey: "onboarding.search", descKey: "onboarding.search.desc", color: "text-violet-400" },
  { icon: Wrench, titleKey: "onboarding.tools", descKey: "onboarding.tools.desc", color: "text-amber-400" },
  { icon: Rocket, titleKey: "onboarding.done", descKey: "onboarding.done.desc", color: "text-repressurizer-accent" },
] as const;

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [step, setStep] = useState(0);
  const t = useT();
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md animate-fade-in rounded-2xl border border-repressurizer-border bg-repressurizer-surface p-8 shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
        {/* Progress dots */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-repressurizer-accent" : i < step ? "w-1.5 bg-repressurizer-accent/50" : "w-1.5 bg-repressurizer-border"
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-repressurizer-bg ${current.color}`}>
            <Icon size={32} weight="duotone" />
          </div>
        </div>

        {/* Content */}
        <h2 className="text-center text-lg font-semibold text-white tracking-tight mb-2">
          {t(current.titleKey as any)}
        </h2>
        <p className="text-center text-sm text-repressurizer-text-muted leading-relaxed mb-8">
          {t(current.descKey as any)}
        </p>

        {/* Buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={onComplete}
            className="text-xs text-repressurizer-text-faint hover:text-repressurizer-text-muted transition-colors"
          >
            {t("onboarding.skip")}
          </button>

          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="btn-press rounded-lg border border-repressurizer-border px-4 py-2 text-sm text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover"
              >
                {t("onboarding.prev")}
              </button>
            )}
            <button
              onClick={() => isLast ? onComplete() : setStep(step + 1)}
              className="btn-press rounded-lg bg-repressurizer-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover"
            >
              {isLast ? t("onboarding.finish") : t("onboarding.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
