import { useEffect, useMemo } from 'react';
import { useGameStore } from '../../hooks/useGame';
import { calculateEnterpriseValue, calculateFounderEquityValue } from '../../engine/scoring';
import { BS_CHECKLIST_INFO, BS_TOTAL_CHECKLIST_ITEMS } from '../../data/businessSchool';

export const BSCHOOL_COMPLETED_KEY = 'holdco-tycoon-bschool-completed';

const SKILLS_MAP: Record<string, string> = {
  bs_collect_1: 'Free Cash Flow Analysis',
  bs_improve: 'Operational Value Creation',
  bs_sell: 'Capital Recycling & Portfolio Pruning',
  bs_acquire_sn: 'Seller-Financed Deal Structuring',
  bs_acquire_bd: 'Leveraged Acquisition Fundamentals',
  bs_ma_sourcing: 'Deal Pipeline Development',
  bs_forge_platform: 'Platform Strategy & Value Creation',
  bs_end_year_1: 'Annual Planning & Execution',
  bs_collect_2: 'Debt Service & Cash Flow Management',
  bs_equity: 'Capital Structure & Dilution Management',
  bs_acquire_lbo: 'Leveraged Buyout Execution',
  bs_shared_service: 'Shared Services & Operational Efficiency',
  bs_pay_debt: 'Balance Sheet Management',
  bs_distribute: 'Shareholder Return Strategy',
  bs_sell_platform: 'Platform Exit Execution',
};

interface BusinessSchoolGraduationProps {
  onStartRealGame: () => void;
  onReplay: () => void;
}

export function BusinessSchoolGraduation({ onStartRealGame, onReplay }: BusinessSchoolGraduationProps) {
  const holdcoName = useGameStore((s) => s.holdcoName);
  const businesses = useGameStore((s) => s.businesses);
  const businessSchoolState = useGameStore((s) => s.businessSchoolState);
  const totalDebt = useGameStore((s) => s.totalDebt);
  const integratedPlatforms = useGameStore((s) => s.integratedPlatforms);

  const stats = useMemo(() => {
    const state = useGameStore.getState();
    const startingFev = 13600;
    const endingFev = calculateFounderEquityValue(state);
    const endingEv = calculateEnterpriseValue(state);
    const activeBusinesses = businesses.filter((b) => b.status === 'active');
    const platformForged = integratedPlatforms.length > 0;
    const completedCount = businessSchoolState?.checklist.completedCount ?? 0;
    const valueGrowth = startingFev > 0 ? Math.round(((endingFev - startingFev) / startingFev) * 100) : 0;

    return { startingFev, endingFev, endingEv, activeCount: activeBusinesses.length, totalDebt, platformForged, completedCount, valueGrowth };
  }, [businesses, businessSchoolState, totalDebt, integratedPlatforms]);

  const fevK = stats.endingFev;
  const tagline = useMemo(() => {
    if (fevK >= 35000) return { honor: 'Summa Cum Laude', sub: 'With Highest Distinction' };
    if (fevK >= 25000) return { honor: 'Cum Laude', sub: 'With Distinction' };
    return { honor: 'Graduate', sub: '' };
  }, [fevK]);

  useEffect(() => {
    try { localStorage.setItem(BSCHOOL_COMPLETED_KEY, 'true'); } catch { /* noop */ }
  }, []);

  const formatK = (val: number) => {
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}M`;
    return `$${val}K`;
  };

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 flex flex-col items-center justify-center">

      {/* ══ THE DIPLOMA ══ */}
      <div className="w-full max-w-xl relative">
        {/* Outer frame — double border with ornamental corners */}
        <div className="relative rounded-sm border-2 border-amber-700/40 p-1.5 sm:p-2 bg-gradient-to-b from-amber-950/30 via-amber-950/10 to-amber-950/30">
          {/* Corner ornaments */}
          <div className="absolute top-1 left-1 text-amber-600/30 text-2xl leading-none select-none">&#9753;</div>
          <div className="absolute top-1 right-1 text-amber-600/30 text-2xl leading-none select-none" style={{ transform: 'scaleX(-1)' }}>&#9753;</div>
          <div className="absolute bottom-1 left-1 text-amber-600/30 text-2xl leading-none select-none" style={{ transform: 'scaleY(-1)' }}>&#9753;</div>
          <div className="absolute bottom-1 right-1 text-amber-600/30 text-2xl leading-none select-none" style={{ transform: 'scale(-1)' }}>&#9753;</div>

          {/* Inner frame */}
          <div className="rounded-sm border border-amber-700/25 bg-gradient-to-b from-amber-50/[0.03] via-transparent to-amber-50/[0.03] px-5 py-6 sm:px-8 sm:py-8">

            {/* Decorative top rule */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />
              <div className="text-amber-600/40 text-xs">&#10022;</div>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />
            </div>

            {/* Institution name */}
            <div className="text-center mb-1">
              <h1
                className="text-[11px] sm:text-xs tracking-[0.35em] text-amber-500/70 uppercase"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                Holdco Tycoon
              </h1>
            </div>
            <div className="text-center mb-5">
              <h2
                className="text-lg sm:text-xl text-amber-400/90 tracking-[0.15em]"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                School of Business
              </h2>
            </div>

            {/* Decorative divider */}
            <div className="flex items-center gap-2 justify-center mb-5">
              <div className="w-12 h-px bg-amber-600/20" />
              <div className="text-amber-600/30 text-[8px]">&#9830; &#9830; &#9830;</div>
              <div className="w-12 h-px bg-amber-600/20" />
            </div>

            {/* Certificate text */}
            <div className="text-center mb-2">
              <p
                className="text-[10px] sm:text-xs text-amber-200/40 tracking-widest uppercase"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                This certifies that
              </p>
            </div>

            {/* Holdco name — the star */}
            <div className="text-center mb-2">
              <p
                className="text-2xl sm:text-3xl text-amber-300 tracking-wide"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic' }}
              >
                {holdcoName}
              </p>
            </div>

            {/* Degree conferral */}
            <div className="text-center mb-1">
              <p
                className="text-[10px] sm:text-xs text-amber-200/40 tracking-widest uppercase"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                has completed the requirements for the degree of
              </p>
            </div>

            <div className="text-center mb-5">
              <p
                className="text-sm sm:text-base text-amber-400/80 tracking-[0.12em]"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                Master of Business Allocation
              </p>
              {tagline.sub && (
                <p
                  className="text-xs text-amber-500/50 mt-1 italic"
                  style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                >
                  {tagline.honor} &mdash; {tagline.sub}
                </p>
              )}
              {!tagline.sub && (
                <p
                  className="text-xs text-amber-500/50 mt-1"
                  style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                >
                  Accelerated Capital Allocation Program
                </p>
              )}
            </div>

            {/* Decorative middle rule */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-600/20 to-transparent" />
              <div className="text-amber-600/30 text-[10px]">&#9733;</div>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-600/20 to-transparent" />
            </div>

            {/* Transcript stats — styled as a formal record */}
            <div className="mb-5">
              <p
                className="text-[9px] tracking-[0.2em] text-amber-500/40 uppercase text-center mb-3"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                Official Transcript
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 max-w-sm mx-auto">
                <div className="flex justify-between items-baseline border-b border-amber-700/10 pb-1">
                  <span className="text-[10px] text-amber-200/30" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>Starting FEV</span>
                  <span className="text-xs text-amber-300/70 font-medium" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{formatK(stats.startingFev)}</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-amber-700/10 pb-1">
                  <span className="text-[10px] text-amber-200/30" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>Ending FEV</span>
                  <span className="text-xs text-amber-300 font-medium" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{formatK(stats.endingFev)}</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-amber-700/10 pb-1">
                  <span className="text-[10px] text-amber-200/30" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>Value Created</span>
                  <span className="text-xs text-emerald-400/80 font-medium" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>+{stats.valueGrowth}%</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-amber-700/10 pb-1">
                  <span className="text-[10px] text-amber-200/30" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>Portfolio</span>
                  <span className="text-xs text-amber-300/70 font-medium" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{stats.activeCount} businesses</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-amber-700/10 pb-1">
                  <span className="text-[10px] text-amber-200/30" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>Platform</span>
                  <span className="text-xs text-amber-300/70 font-medium" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{stats.platformForged ? 'Forged' : 'Not forged'}</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-amber-700/10 pb-1">
                  <span className="text-[10px] text-amber-200/30" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>Coursework</span>
                  <span className="text-xs text-amber-300/70 font-medium" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{stats.completedCount}/{BS_TOTAL_CHECKLIST_ITEMS}</span>
                </div>
              </div>
            </div>

            {/* Coursework completed — formal skills list */}
            <div className="mb-4">
              <p
                className="text-[9px] tracking-[0.2em] text-amber-500/40 uppercase text-center mb-3"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                Coursework Completed
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 max-w-md mx-auto">
                {BS_CHECKLIST_INFO.map((item) => {
                  const isCompleted = businessSchoolState?.checklist.items[item.id] ?? false;
                  const skill = SKILLS_MAP[item.id] ?? item.title;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-1.5 py-0.5 ${
                        isCompleted ? 'text-amber-400/70' : 'text-amber-200/20'
                      }`}
                    >
                      <span className="text-[10px]" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                        {isCompleted ? '\u2713' : '\u2013'}
                      </span>
                      <span className="text-[10px] sm:text-[11px]" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                        {skill}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom decorative rule */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />
              <div className="text-amber-600/40 text-xs">&#10022;</div>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />
            </div>

          </div>
        </div>
      </div>

      {/* ══ BELOW THE DIPLOMA — CTAs ══ */}
      <div className="w-full max-w-md mt-8 flex flex-col gap-3">
        <p className="text-sm text-text-secondary text-center mb-1">
          You've earned your MBA. Now go build a real holdco.
        </p>
        <button
          onClick={onStartRealGame}
          className="btn-primary w-full text-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400"
        >
          Start Building Your Holdco
        </button>
        <button
          onClick={onReplay}
          className="btn-secondary w-full text-sm"
        >
          Replay Business School
        </button>
      </div>
    </div>
  );
}
