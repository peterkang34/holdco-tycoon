import { ScoreBar } from './ScoreBar';

// Grade thresholds (from scoring.ts / gameConfig.ts)
const HOLDCO_GRADE_THRESHOLDS: Record<string, number> = {
  S: 95, A: 82, B: 65, C: 45, D: 25, F: 0,
};
const PE_GRADE_THRESHOLDS: Record<string, number> = {
  S: 90, A: 75, B: 60, C: 40, D: 20, F: 0,
};

interface HoldcoScore {
  total: number;
  grade: string;
  title: string;
  valueCreation: number;
  fcfShareGrowth: number;
  portfolioRoic: number;
  capitalDeployment: number;
  balanceSheetHealth: number;
  strategicDiscipline: number;
}

interface PEScore {
  total: number;
  grade: string;
  gradeTitle: string;
  returnGeneration: number;
  capitalEfficiency: number;
  valueCreation: number;
  deploymentDiscipline: number;
  riskManagement: number;
  lpSatisfaction: number;
}

interface GradeTip {
  dimension: string;
  label: string;
  max: number;
  tipThreshold: number;
  tip: string;
}

interface ScoreBreakdownSectionProps {
  isFundManagerMode: boolean;
  score?: HoldcoScore;
  peScore?: PEScore;
  gradeTips: GradeTip[];
}

function getNextGradeInfo(
  total: number,
  thresholds: Record<string, number>,
): { nextGrade: string; pointsNeeded: number; isMax: boolean } {
  const grades = ['S', 'A', 'B', 'C', 'D', 'F'];
  for (const grade of grades) {
    if (total >= thresholds[grade]) {
      if (grade === 'S') {
        return { nextGrade: 'S', pointsNeeded: 0, isMax: true };
      }
      const idx = grades.indexOf(grade);
      const nextGrade = grades[idx - 1];
      const pointsNeeded = thresholds[nextGrade] - total;
      return { nextGrade, pointsNeeded, isMax: false };
    }
  }
  // Below F threshold — next grade is D
  return { nextGrade: 'D', pointsNeeded: thresholds.D - total, isMax: false };
}

export function ScoreBreakdownSection({
  isFundManagerMode,
  score,
  peScore,
  gradeTips,
}: ScoreBreakdownSectionProps) {
  const activeScore = isFundManagerMode ? peScore : score;
  if (!activeScore) return null;

  const thresholds = isFundManagerMode ? PE_GRADE_THRESHOLDS : HOLDCO_GRADE_THRESHOLDS;
  const title = isFundManagerMode
    ? (peScore as PEScore).gradeTitle
    : (score as HoldcoScore).title;
  const { nextGrade, pointsNeeded, isMax } = getNextGradeInfo(activeScore.total, thresholds);

  // Build dimension list with tips
  const dimensions: Array<{ key: string; label: string; value: number; max: number }> = isFundManagerMode
    ? [
        { key: 'returnGeneration', label: 'Return Generation (Net IRR)', value: (peScore as PEScore).returnGeneration, max: 25 },
        { key: 'capitalEfficiency', label: 'Capital Efficiency (Gross MOIC)', value: (peScore as PEScore).capitalEfficiency, max: 20 },
        { key: 'valueCreation', label: 'Value Creation (EBITDA Growth)', value: (peScore as PEScore).valueCreation, max: 15 },
        { key: 'deploymentDiscipline', label: 'Deployment Discipline', value: (peScore as PEScore).deploymentDiscipline, max: 15 },
        { key: 'riskManagement', label: 'Risk Management', value: (peScore as PEScore).riskManagement, max: 15 },
        { key: 'lpSatisfaction', label: 'LP Satisfaction', value: (peScore as PEScore).lpSatisfaction, max: 10 },
      ]
    : [
        { key: 'valueCreation', label: 'Value Creation (FEV / Capital)', value: (score as HoldcoScore).valueCreation, max: 20 },
        { key: 'fcfShareGrowth', label: 'FCF/Share Growth', value: (score as HoldcoScore).fcfShareGrowth, max: 20 },
        { key: 'portfolioRoic', label: 'Portfolio ROIC', value: (score as HoldcoScore).portfolioRoic, max: 15 },
        { key: 'capitalDeployment', label: 'Capital Deployment (MOIC + ROIIC)', value: (score as HoldcoScore).capitalDeployment, max: 15 },
        { key: 'balanceSheetHealth', label: 'Balance Sheet Health', value: (score as HoldcoScore).balanceSheetHealth, max: 15 },
        { key: 'strategicDiscipline', label: 'Strategic Discipline', value: (score as HoldcoScore).strategicDiscipline, max: 15 },
      ];

  // Map tips by dimension key
  const tipsByDimension = new Map(gradeTips.map((t) => [t.dimension, t]));

  return (
    <div className="card mb-6">
      {/* Section header */}
      <p className="text-xs font-bold tracking-widest text-text-muted mb-3">YOUR GRADE</p>
      <p className="text-lg font-bold mb-4">
        {activeScore.grade} — {title}
      </p>

      {/* Score bars with per-dimension tips */}
      {dimensions.map((dim) => {
        const tipData = tipsByDimension.get(dim.key);
        const showTip = tipData && dim.value < tipData.tipThreshold;
        return (
          <ScoreBar
            key={dim.key}
            label={dim.label}
            value={dim.value}
            max={dim.max}
            tip={showTip ? tipData.tip : undefined}
          />
        );
      })}

      {/* Next grade proximity bar */}
      <div className="mt-5 pt-4 border-t border-white/10">
        {isMax ? (
          <p className="text-sm text-text-muted text-center">
            You've mastered capital allocation. There's no grade above S.
          </p>
        ) : (
          <>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-text-muted">NEXT GRADE</span>
              <span className="font-mono text-text-secondary">
                {pointsNeeded} point{pointsNeeded !== 1 ? 's' : ''} to {nextGrade}
              </span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent to-accent-secondary"
                style={{
                  width: `${Math.min(100, ((activeScore.total - (thresholds[activeScore.grade as keyof typeof thresholds] ?? 0)) / (pointsNeeded + activeScore.total - (thresholds[activeScore.grade as keyof typeof thresholds] ?? 0))) * 100)}%`,
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Total score */}
      <div className="mt-4 pt-4 border-t border-white/10 text-center">
        <span className="text-2xl font-bold font-mono">{activeScore.total} / 100</span>
      </div>
    </div>
  );
}
