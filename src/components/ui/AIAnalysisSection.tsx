import { useState, useEffect } from 'react';
import {
  AIGameAnalysis,
  generateGameAnalysis,
  generateFallbackAnalysis,
  isAIEnabled,
} from '../../services/aiGeneration';
import { GameState, ScoreBreakdown, Business } from '../../engine/types';

interface AIAnalysisSectionProps {
  holdcoName: string;
  score: ScoreBreakdown;
  enterpriseValue: number;
  businesses: Business[];
  exitedBusinesses: Business[];
  metricsHistory: GameState['metricsHistory'];
  totalDistributions: number;
  totalBuybacks: number;
  totalInvestedCapital: number;
  equityRaisesUsed: number;
  sharedServicesActive: number;
  maxRounds?: number;
  difficulty?: string;
  founderEquityValue?: number;
  founderOwnership?: number;
}

export function AIAnalysisSection({
  holdcoName,
  score,
  enterpriseValue,
  businesses,
  exitedBusinesses,
  metricsHistory,
  totalDistributions,
  totalBuybacks,
  totalInvestedCapital,
  equityRaisesUsed,
  sharedServicesActive,
  maxRounds = 20,
  difficulty,
  founderEquityValue,
  founderOwnership,
}: AIAnalysisSectionProps) {
  const [analysis, setAnalysis] = useState<AIGameAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAI, setIsAI] = useState(false);

  useEffect(() => {
    async function fetchAnalysis() {
      setLoading(true);

      const input = {
        holdcoName,
        score,
        enterpriseValue,
        totalRounds: maxRounds,
        difficulty,
        founderEquityValue,
        founderOwnership,
        businesses,
        exitedBusinesses,
        metricsHistory: metricsHistory.map(h => ({
          round: h.round,
          metrics: {
            totalEbitda: h.metrics.totalEbitda,
            totalRevenue: h.metrics.totalRevenue ?? 0,
            avgEbitdaMargin: h.metrics.avgEbitdaMargin ?? 0,
            portfolioRoic: h.metrics.portfolioRoic,
            netDebtToEbitda: h.metrics.netDebtToEbitda,
            fcfPerShare: h.metrics.fcfPerShare,
          },
        })),
        totalDistributions,
        totalBuybacks,
        totalInvestedCapital,
        equityRaisesUsed,
        sharedServicesActive,
      };

      if (isAIEnabled()) {
        const aiAnalysis = await generateGameAnalysis(input);
        if (aiAnalysis) {
          setAnalysis(aiAnalysis);
          setIsAI(true);
        } else {
          setAnalysis(generateFallbackAnalysis(input));
          setIsAI(false);
        }
      } else {
        setAnalysis(generateFallbackAnalysis(input));
        setIsAI(false);
      }

      setLoading(false);
    }

    fetchAnalysis();
  }, [
    holdcoName,
    score,
    enterpriseValue,
    businesses,
    exitedBusinesses,
    metricsHistory,
    totalDistributions,
    totalBuybacks,
    totalInvestedCapital,
    equityRaisesUsed,
    sharedServicesActive,
  ]);

  if (loading) {
    return (
      <div className="card mb-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-pulse flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <span className="text-text-muted">Analyzing your performance...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span>🤖</span> AI Performance Analysis
        </h2>
        {isAI && (
          <span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded">
            Powered by Claude
          </span>
        )}
      </div>

      {/* Overall Assessment */}
      <div className="p-4 bg-white/5 rounded-lg mb-4">
        <p className="text-text-secondary leading-relaxed">{analysis.overallAssessment}</p>
      </div>

      {/* Strengths & Improvements Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Strengths */}
        <div className="p-4 bg-accent/10 border border-accent/30 rounded-lg">
          <h3 className="font-bold text-accent mb-3 flex items-center gap-2">
            <span>✓</span> What You Did Well
          </h3>
          <ul className="space-y-2">
            {analysis.keyStrengths.map((strength, i) => (
              <li key={i} className="text-sm text-text-secondary flex gap-2">
                <span className="text-accent mt-1">•</span>
                <span>{strength}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Areas for Improvement */}
        <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
          <h3 className="font-bold text-warning mb-3 flex items-center gap-2">
            <span>↑</span> Areas to Improve
          </h3>
          <ul className="space-y-2">
            {analysis.areasForImprovement.map((area, i) => (
              <li key={i} className="text-sm text-text-secondary flex gap-2">
                <span className="text-warning mt-1">•</span>
                <span>{area}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Specific Lessons */}
      {analysis.specificLessons.length > 0 && (
        <div className="mb-4">
          <h3 className="font-bold text-text-primary mb-3">Key Lessons</h3>
          <div className="space-y-3">
            {analysis.specificLessons.map((lesson, i) => (
              <div
                key={i}
                className="p-4 bg-white/5 rounded-lg border-l-2 border-accent"
              >
                <p className="text-sm text-text-muted mb-2">{lesson.observation}</p>
                <p className="text-text-secondary">{lesson.lesson}</p>
                {lesson.reference && (
                  <p className="text-xs text-accent mt-2 italic">— {lesson.reference}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What-If Scenario */}
      {analysis.whatIfScenario && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <h3 className="font-bold text-blue-400 mb-2 flex items-center gap-2">
            <span>💡</span> What If...
          </h3>
          <p className="text-sm text-text-secondary">{analysis.whatIfScenario}</p>
        </div>
      )}
    </div>
  );
}
