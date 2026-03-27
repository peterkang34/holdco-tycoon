import { useState } from 'react';
import { useGameStore } from '../../hooks/useGame';
import { BS_CHECKLIST_INFO, BS_YEAR_1_ITEMS, BS_YEAR_2_ITEMS, BS_TOTAL_CHECKLIST_ITEMS } from '../../data/businessSchool';
import type { BusinessSchoolChecklistItemId } from '../../engine/types';
import { useIsMobile } from '../../hooks/useMediaQuery';

export function BusinessSchoolChecklist() {
  const businessSchoolState = useGameStore((s) => s.businessSchoolState);
  const round = useGameStore((s) => s.round);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [manualCollapse, setManualCollapse] = useState<BusinessSchoolChecklistItemId | null>(null);
  const isMobile = useIsMobile();

  if (!businessSchoolState) return null;

  const { checklist } = businessSchoolState;
  const completedCount = checklist.completedCount;

  // Find the first uncompleted item in original order as "current"
  const allItemsOrdered = [...BS_YEAR_1_ITEMS, ...BS_YEAR_2_ITEMS];
  const currentItemId = allItemsOrdered.find((id) => !checklist.items[id]) ?? null;

  // Get current item info for mobile collapsed bar
  const currentItemInfo = currentItemId
    ? BS_CHECKLIST_INFO.find((i) => i.id === currentItemId)
    : null;
  const currentStepNumber = currentItemId
    ? allItemsOrdered.indexOf(currentItemId) + 1
    : BS_TOTAL_CHECKLIST_ITEMS;

  const renderItem = (itemId: BusinessSchoolChecklistItemId) => {
    const info = BS_CHECKLIST_INFO.find((i) => i.id === itemId);
    if (!info) return null;

    const isCompleted = checklist.items[itemId];
    const isCurrent = itemId === currentItemId;
    // Auto-expand the current item unless manually collapsed
    const isExpanded = isCurrent && manualCollapse !== itemId;

    return (
      <div key={itemId} className="relative">
        <button
          type="button"
          onClick={() => {
            if (isCurrent) {
              setManualCollapse(manualCollapse === itemId ? null : itemId);
            }
          }}
          aria-expanded={isCurrent ? isExpanded : undefined}
          className={`w-full flex items-start gap-2 py-2.5 px-2 rounded text-left transition-colors min-h-[44px] ${
            isCurrent ? 'text-text-primary font-medium hover:bg-white/5' : ''
          }`}
        >
          <span className="mt-0.5 shrink-0 w-4 text-center">
            {isCompleted ? (
              <span className="text-emerald-400">&#10003;</span>
            ) : isCurrent ? (
              <span className="text-emerald-400 text-xs">&#9654;</span>
            ) : (
              <span className="text-text-muted/40">&#9675;</span>
            )}
          </span>
          <span
            className={`text-sm leading-snug ${
              isCompleted
                ? 'text-emerald-400/80 line-through'
                : isCurrent
                  ? 'text-text-primary'
                  : 'text-text-muted'
            }`}
          >
            {info.title}
          </span>
        </button>
        {isExpanded && (
          <div className="ml-6 mr-1 mb-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-text-secondary leading-relaxed">
            <p>{info.subtitle}</p>
          </div>
        )}
      </div>
    );
  };

  // Mobile: prominent coach card with always-visible instructions
  if (isMobile) {
    const allDone = completedCount >= BS_TOTAL_CHECKLIST_ITEMS;
    const progressPct = (completedCount / BS_TOTAL_CHECKLIST_ITEMS) * 100;

    return (
      <div className="bg-emerald-950/80 border-b-2 border-emerald-500/50">
        {/* Current step — always visible */}
        <div className="px-4 pt-3 pb-2.5">
          {/* Header row: coach label + progress badge */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400 text-sm">&#127891;</span>
              <span className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase">
                Business School
              </span>
            </div>
            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full">
              {completedCount}/{BS_TOTAL_CHECKLIST_ITEMS}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1 rounded-full bg-white/10 overflow-hidden mb-2.5">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {allDone ? (
            <p className="text-sm font-medium text-emerald-400">
              All steps complete — well done!
            </p>
          ) : (
            <>
              {/* Step title */}
              <p className="text-sm font-semibold text-text-primary leading-snug">
                <span className="text-emerald-400 mr-1">Step {currentStepNumber}:</span>
                {currentItemInfo?.title}
              </p>
              {/* Step description — the key instruction, always visible */}
              <p className="mt-1.5 text-xs text-emerald-200/80 leading-relaxed">
                {currentItemInfo?.subtitle}
              </p>
            </>
          )}
        </div>

        {/* View all steps toggle */}
        {!allDone && (
          <button
            type="button"
            onClick={() => setMobileExpanded(!mobileExpanded)}
            className="w-full px-4 py-2 flex items-center justify-center gap-1.5 border-t border-emerald-500/20 min-h-[36px]"
          >
            <span className="text-[11px] text-emerald-400/70 font-medium">
              {mobileExpanded ? 'Hide all steps' : 'View all steps'}
            </span>
            <span className="text-emerald-400/50 text-[10px]">
              {mobileExpanded ? '\u25B2' : '\u25BC'}
            </span>
          </button>
        )}

        {/* Expanded full checklist */}
        {mobileExpanded && (
          <div className="px-4 pb-3 border-t border-emerald-500/10 max-h-[50vh] overflow-y-auto">
            <div className="mt-3 mb-2">
              <div className="text-[10px] font-bold text-emerald-400/80 tracking-wider mb-1.5">YEAR 1</div>
              {BS_YEAR_1_ITEMS.map(renderItem)}
            </div>
            <div className="mb-2">
              <div className="text-[10px] font-bold text-emerald-400/80 tracking-wider mb-1.5">YEAR 2</div>
              {BS_YEAR_2_ITEMS.map(renderItem)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop: sticky sidebar
  return (
    <div className="w-[260px] shrink-0 bg-bg-card border-l border-emerald-500/20 overflow-y-auto sticky top-0 h-screen">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">&#127891;</span>
          <span className="text-sm font-bold text-emerald-400">
            {round <= 1 ? 'YEAR 1' : 'YEAR 2'} CHECKLIST
          </span>
        </div>

        {/* Year 1 items */}
        <div className="mb-3">
          <div className="text-[10px] font-bold text-emerald-400/60 tracking-wider mb-1.5">YEAR 1</div>
          {BS_YEAR_1_ITEMS.map(renderItem)}
        </div>

        {/* Year 2 items */}
        <div className="mb-3">
          <div className="text-[10px] font-bold text-emerald-400/60 tracking-wider mb-1.5">YEAR 2</div>
          {BS_YEAR_2_ITEMS.map(renderItem)}
        </div>

        {/* Progress */}
        <div className="pt-3 border-t border-white/10">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>{completedCount} of {BS_TOTAL_CHECKLIST_ITEMS} complete</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${(completedCount / BS_TOTAL_CHECKLIST_ITEMS) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
