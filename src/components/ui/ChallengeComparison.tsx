import { useState, useEffect } from 'react';
import { formatMoney } from '../../engine/types';
import {
  type PlayerResult,
  type ChallengeParams,
  type ComparisonEntry,
  decodePlayerResult,
  compareResults,
  isTied,
  buildResultUrl,
  shareChallenge,
} from '../../utils/challenge';
import { getGradeColor } from '../../utils/gradeColors';

interface ChallengeComparisonProps {
  challengeParams: ChallengeParams;
  myResult: PlayerResult;
  initialOpponentResult?: PlayerResult | null;
  onClose: () => void;
}

export function ChallengeComparison({ challengeParams, myResult, initialOpponentResult, onClose }: ChallengeComparisonProps) {
  const [resultCodes, setResultCodes] = useState<string[]>(
    initialOpponentResult ? [] : ['']
  );
  const [results, setResults] = useState<ComparisonEntry[]>(() => {
    if (initialOpponentResult) {
      return compareResults([
        { result: myResult, isYou: true },
        { result: initialOpponentResult, isYou: false },
      ]);
    }
    return [{ result: myResult, isYou: true }];
  });
  const [parseError, setParseError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Lock body scroll when modal is open (prevents iOS Safari scroll bleed)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleAddResult = () => {
    if (resultCodes.length < 3) {
      setResultCodes([...resultCodes, '']);
    }
  };

  const handleResultCodeChange = (index: number, value: string) => {
    const updated = [...resultCodes];
    updated[index] = value;
    setResultCodes(updated);
    setParseError(null);
  };

  const handleCompare = () => {
    const entries: ComparisonEntry[] = [{ result: myResult, isYou: true }];

    for (const code of resultCodes) {
      const trimmed = code.trim();
      if (!trimmed) continue;

      // Extract result — could be a full URL or just the r= param value
      let resultCode = trimmed;
      if (trimmed.includes('r=')) {
        const match = trimmed.match(/[?&]r=([^&]+)/);
        if (match) resultCode = match[1];
      }

      const decoded = decodePlayerResult(resultCode);
      if (!decoded) {
        setParseError(`Could not parse result: "${trimmed.slice(0, 30)}..."`);
        return;
      }
      entries.push({ result: decoded, isYou: false });
    }

    if (entries.length < 2) {
      setParseError('Paste at least one opponent\'s result to compare.');
      return;
    }

    setResults(compareResults(entries));
    setParseError(null);
  };

  const handleShareMyResult = async () => {
    const url = buildResultUrl(challengeParams, myResult);
    const shared = await shareChallenge(url, 'My Holdco Tycoon result');
    if (shared) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const sorted = results.length > 1 ? results : null;
  const winner = sorted ? sorted[0] : null;
  const hasTie = sorted && sorted.length >= 2 && isTied(sorted[0].result, sorted[1].result);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-secondary border border-white/10 rounded-xl max-w-2xl w-full max-h-[90dvh] overflow-y-auto overscroll-contain p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Compare Results</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-xl min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            x
          </button>
        </div>

        {/* My Result */}
        <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Your result</span>
            <button
              onClick={handleShareMyResult}
              className="text-xs text-accent hover:text-accent/80 transition-colors min-h-[44px] flex items-center"
            >
              {copied ? 'Copied!' : 'Share My Result'}
            </button>
          </div>
        </div>

        {/* Input opponent results */}
        {!sorted && (
          <>
            <p className="text-sm text-text-muted mb-3">
              Paste your opponents' results below:
            </p>
            {resultCodes.map((code, i) => (
              <div key={i} className="mb-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => handleResultCodeChange(i, e.target.value)}
                  placeholder={`Player ${i + 2} result`}
                  autoComplete="off"
                  autoCapitalize="off"
                  className="w-full min-h-[44px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              </div>
            ))}
            {resultCodes.length < 3 && (
              <button
                onClick={handleAddResult}
                className="text-xs text-accent hover:text-accent/80 min-h-[44px] inline-flex items-center mb-3"
              >
                + Add another player
              </button>
            )}
            {parseError && (
              <p className="text-danger text-xs mb-3">{parseError}</p>
            )}
            <button
              onClick={handleCompare}
              className="btn-primary w-full"
            >
              Compare
            </button>
          </>
        )}

        {/* Comparison Table */}
        {sorted && (
          <>
            {/* Winner banner */}
            {winner && !hasTie && (
              <div className="mb-4 p-3 rounded-lg bg-accent/10 border border-accent/30 text-center">
                <span className="text-accent font-bold">
                  {winner.isYou ? 'You win!' : `${winner.result.name} wins!`}
                </span>
              </div>
            )}
            {hasTie && (
              <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
                <span className="text-yellow-400 font-bold">Tied!</span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 text-text-muted font-medium">Metric</th>
                    {sorted.map((entry, i) => (
                      <th key={i} className={`text-right py-2 font-medium whitespace-nowrap ${entry.isYou ? 'text-accent' : 'text-text-primary'}`}>
                        {entry.isYou ? 'You' : entry.result.name}
                        {i === 0 && !hasTie && <span className="ml-1 text-yellow-400">*</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <ComparisonRow label="Holdco" values={sorted.map(e => e.result.name)} />
                  <ComparisonRow
                    label="FEV"
                    values={sorted.map(e => formatMoney(e.result.fev))}
                    highlight
                  />
                  <ComparisonRow
                    label="Total Return"
                    values={sorted.map(e => formatMoney(e.result.fev + e.result.totalDistributions))}
                  />
                  <ComparisonRow
                    label="Score"
                    values={sorted.map(e => `${e.result.score}/100`)}
                  />
                  <ComparisonRow
                    label="Grade"
                    values={sorted.map(e => e.result.grade)}
                    colorFn={(v) => getGradeColor(v as 'S' | 'A' | 'B' | 'C' | 'D' | 'F')}
                  />
                  <ComparisonRow
                    label="Distributions"
                    values={sorted.map(e => formatMoney(e.result.totalDistributions))}
                  />
                  <ComparisonRow
                    label="Businesses"
                    values={sorted.map(e => String(e.result.businesses))}
                  />
                  <ComparisonRow
                    label="Sectors"
                    values={sorted.map(e => String(e.result.sectors))}
                  />
                  <ComparisonRow
                    label="Peak Leverage"
                    values={sorted.map(e => `${e.result.peakLeverage.toFixed(1)}x`)}
                  />
                  <ComparisonRow
                    label="Restructured"
                    values={sorted.map(e => e.result.restructured ? 'Yes' : 'No')}
                    colorFn={(v) => v === 'Yes' ? 'text-danger' : 'text-success'}
                  />
                </tbody>
              </table>
            </div>

            <button
              onClick={() => setResults([{ result: myResult, isYou: true }])}
              className="mt-4 min-h-[44px] text-sm text-text-muted hover:text-text-primary transition-colors inline-flex items-center"
            >
              Reset comparison
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Table Row Component ──────────────────────────────────────────

function ComparisonRow({
  label,
  values,
  highlight,
  colorFn,
}: {
  label: string;
  values: string[];
  highlight?: boolean;
  colorFn?: (value: string) => string;
}) {
  return (
    <tr className={`border-b border-white/5 ${highlight ? 'bg-white/5' : ''}`}>
      <td className="py-2 text-text-muted">{label}</td>
      {values.map((value, i) => (
        <td
          key={i}
          className={`py-2 text-right whitespace-nowrap ${colorFn ? colorFn(value) : 'text-text-primary'}`}
        >
          {value}
        </td>
      ))}
    </tr>
  );
}
