import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../../hooks/useGame';
import { useAuthStore, useIsLoggedIn } from '../../hooks/useAuth';
import { calculateEnterpriseValue, calculateFounderEquityValue } from '../../engine/scoring';
import { BS_CHECKLIST_INFO, BS_TOTAL_CHECKLIST_ITEMS } from '../../data/businessSchool';
import { submitGameCompletion } from '../../services/completionApi';
import { saveEarnedAchievements, isAchievementEarned } from '../../hooks/useUnlocks';

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
  const isLoggedIn = useIsLoggedIn();
  const playerId = useAuthStore((s) => s.player?.id);
  const openAccountModal = useAuthStore((s) => s.openAccountModal);

  // Signup intercept modal — shown to anonymous users before starting real game
  const [showSignupIntercept, setShowSignupIntercept] = useState(false);

  const handleStartClick = useCallback(() => {
    if (isLoggedIn) {
      onStartRealGame();
    } else {
      setShowSignupIntercept(true);
    }
  }, [isLoggedIn, onStartRealGame]);

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
  const completionTier = useMemo(() => {
    const count = stats.completedCount;
    if (count >= BS_TOTAL_CHECKLIST_ITEMS) {
      // Full completion — honor based on FEV
      if (fevK >= 35000) return { tier: 'full' as const, honor: 'Summa Cum Laude', sub: 'With Highest Distinction', conferral: 'has completed the requirements for the degree of' };
      if (fevK >= 25000) return { tier: 'full' as const, honor: 'Cum Laude', sub: 'With Distinction', conferral: 'has completed the requirements for the degree of' };
      return { tier: 'full' as const, honor: 'Graduate', sub: '', conferral: 'has completed the requirements for the degree of' };
    }
    if (count >= 10) return { tier: 'partial' as const, honor: 'Passed', sub: `${count}/${BS_TOTAL_CHECKLIST_ITEMS} Coursework Completed`, conferral: 'has substantially completed the requirements for' };
    if (count >= 5) return { tier: 'conditional' as const, honor: 'Conditional Pass', sub: `${count}/${BS_TOTAL_CHECKLIST_ITEMS} Coursework Completed`, conferral: 'has partially completed the requirements for' };
    return { tier: 'audit' as const, honor: 'Program Audited', sub: `${count}/${BS_TOTAL_CHECKLIST_ITEMS} Coursework Completed`, conferral: 'attended the' };
  }, [fevK, stats.completedCount]);

  // Track whether this is a newly earned achievement (before we save it)
  // Only award achievement for 10+ completion (partial or full)
  const isNewAchievement = useRef(stats.completedCount >= 10 && !isAchievementEarned('bschool_graduate'));

  const submittedRef = useRef(false);
  useEffect(() => {
    try { localStorage.setItem(BSCHOOL_COMPLETED_KEY, 'true'); } catch { /* noop */ }
    // Save B-School Graduate achievement only if 10+ items completed
    if (stats.completedCount >= 10) {
      saveEarnedAchievements(['bschool_graduate']);
    }
    // Submit B-School completion for admin analytics (fire-and-forget, once)
    if (!submittedRef.current) {
      submittedRef.current = true;
      submitGameCompletion({
        isBusinessSchool: true,
        holdcoName,
        founderEquityValue: stats.endingFev,
        enterpriseValue: stats.endingEv,
        checklistCompleted: stats.completedCount,
        checklistTotal: BS_TOTAL_CHECKLIST_ITEMS,
        platformForged: stats.platformForged,
        businessCount: stats.activeCount,
        totalDebt: stats.totalDebt,
        difficulty: 'easy',
        duration: 'quick',
        totalRounds: 2,
        isLoggedIn,
        playerId: playerId ?? undefined,
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
                {completionTier.conferral}
              </p>
            </div>

            <div className="text-center mb-5">
              <p
                className={`text-sm sm:text-base tracking-[0.12em] ${completionTier.tier === 'audit' || completionTier.tier === 'conditional' ? 'text-slate-400/80' : 'text-amber-400/80'}`}
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                Master of Business Allocation
              </p>
              <p
                className={`text-xs mt-1 ${completionTier.tier === 'audit' || completionTier.tier === 'conditional' ? 'text-slate-500/50' : 'text-amber-500/50'} ${completionTier.sub ? 'italic' : ''}`}
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                {completionTier.sub ? `${completionTier.honor} — ${completionTier.sub}` : completionTier.honor}
              </p>
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

      {/* ══ ACHIEVEMENT UNLOCKED ══ */}
      {isNewAchievement.current && (
        <div className="w-full max-w-xl mt-5">
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-4 py-3 flex items-center gap-3">
            <span className="text-2xl select-none">🎓</span>
            <div className="flex-1">
              <p className="text-sm text-amber-300 font-medium">Achievement Unlocked</p>
              <p className="text-xs text-amber-200/50">B-School Graduate — your first step toward unlocking prestige sectors</p>
            </div>
          </div>
        </div>
      )}

      {/* ══ SAVE YOUR DIPLOMA — signup nudge (anonymous only) ══ */}
      {!isLoggedIn && (
        <div className="w-full max-w-xl mt-4">
          <div className="rounded-lg border border-amber-600/20 bg-amber-950/20 px-5 py-4 flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
            <div className="shrink-0 text-amber-500/60 text-2xl select-none">&#127891;</div>
            <div className="flex-1 text-center sm:text-left">
              <p className="text-sm text-amber-300/90 font-medium">Save your diploma &amp; achievement</p>
              <p className="text-xs text-amber-200/40 mt-0.5">
                Create a free account to keep your B-School Graduate achievement, track progress, and compete on the leaderboard.
              </p>
            </div>
            <button
              onClick={() => openAccountModal('create')}
              className="shrink-0 min-h-[44px] px-5 rounded-lg text-sm font-medium bg-amber-600/20 text-amber-300 border border-amber-600/30 hover:bg-amber-600/30 hover:border-amber-500/40 transition-colors"
            >
              Sign Up (Free)
            </button>
          </div>
        </div>
      )}

      {/* ══ BELOW THE DIPLOMA — CTAs ══ */}
      <div className="w-full max-w-md mt-8 flex flex-col gap-3">
        <p className="text-sm text-text-secondary text-center mb-1">
          {completionTier.tier === 'full'
            ? "You've earned your MBA. Now go build a real holdco."
            : completionTier.tier === 'partial'
            ? 'You know the basics. The real game will fill in the gaps.'
            : completionTier.tier === 'conditional'
            ? "You've seen the mechanics, but there's more to learn."
            : 'Business School has a lot more to teach you.'
          }
        </p>
        {completionTier.tier === 'audit' ? (
          <>
            <button
              onClick={onReplay}
              className="btn-primary w-full text-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400"
            >
              Replay &amp; Earn Your Diploma
            </button>
            <button
              onClick={handleStartClick}
              className="w-full py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              Skip to the real game
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleStartClick}
              className="btn-primary w-full text-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400"
            >
              Start Building Your Holdco
            </button>
            <button
              onClick={onReplay}
              className="btn-secondary w-full text-sm"
            >
              {completionTier.tier === 'full' ? 'Replay Business School' : 'Replay & Complete All Coursework'}
            </button>
          </>
        )}
      </div>

      {/* ══ SIGNUP INTERCEPT MODAL (anonymous users only) ══ */}
      {showSignupIntercept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSignupIntercept(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md rounded-lg border border-amber-700/30 bg-gradient-to-b from-[#1a1408] via-[#141008] to-[#1a1408] shadow-2xl shadow-amber-900/20 overflow-hidden">

            {/* Decorative top bar */}
            <div className="h-1 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

            <div className="px-6 py-6 sm:px-8 sm:py-7">
              {/* Header */}
              <div className="text-center mb-5">
                <span className="text-3xl block mb-2 select-none">&#127891;</span>
                <h3
                  className="text-lg sm:text-xl text-amber-300 tracking-wide mb-1"
                  style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                >
                  Before You Build...
                </h3>
                <p className="text-sm text-amber-200/50">
                  A free account unlocks the full experience
                </p>
              </div>

              {/* Benefit bullets */}
              <div className="space-y-2.5 mb-6">
                {[
                  { icon: '\u{1F4CA}', text: 'Track your game history and personal records' },
                  { icon: '\u{1F3C6}', text: 'Earn achievements and prestige titles' },
                  { icon: '\u{1F513}', text: 'Unlock prestige sectors (Media, Fintech, Aerospace)' },
                  { icon: '\u{1F4D6}', text: 'Review AI strategy debriefs after each game' },
                  { icon: '\u{1F3AF}', text: 'Compete on the global leaderboard' },
                ].map((item) => (
                  <div key={item.text} className="flex items-start gap-3">
                    <span className="text-base leading-6 shrink-0 select-none">{item.icon}</span>
                    <span className="text-sm text-amber-100/70 leading-snug">{item.text}</span>
                  </div>
                ))}
              </div>

              {/* Primary CTA */}
              <button
                onClick={() => {
                  setShowSignupIntercept(false);
                  openAccountModal('create');
                }}
                className="w-full min-h-[48px] rounded-lg text-base font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors mb-3"
              >
                Create Free Account
              </button>

              {/* Secondary — skip */}
              <button
                onClick={() => {
                  setShowSignupIntercept(false);
                  onStartRealGame();
                }}
                className="w-full py-2 text-sm text-amber-400/60 hover:text-amber-300/80 transition-colors"
              >
                Continue without an account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
