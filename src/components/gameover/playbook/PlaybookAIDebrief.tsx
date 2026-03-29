interface AIDebrief {
  overallAssessment?: string;
  keyStrengths?: string[];
  areasForImprovement?: string[];
  specificLessons?: Array<{ observation: string; lesson: string; reference?: string }>;
  whatIfScenario?: string;
}

interface PlaybookAIDebriefProps {
  aiDebrief: AIDebrief;
}

export function PlaybookAIDebrief({ aiDebrief }: PlaybookAIDebriefProps) {
  if (!aiDebrief?.overallAssessment) return null;

  return (
    <div className="mt-6 pt-4 border-t border-white/5">
      <p className="text-xs font-bold tracking-widest text-purple-400/60 mb-3 uppercase">Strategy Debrief</p>

      {/* Overall Assessment */}
      <p className="text-sm text-text-secondary leading-relaxed mb-4">
        {aiDebrief.overallAssessment}
      </p>

      {/* Strengths */}
      {aiDebrief.keyStrengths && aiDebrief.keyStrengths.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-bold text-emerald-400/60 tracking-wider uppercase mb-1.5">Strengths</p>
          <ul className="space-y-1">
            {aiDebrief.keyStrengths.map((s, i) => (
              <li key={i} className="text-xs text-text-secondary leading-relaxed flex gap-2">
                <span className="text-emerald-400/50 shrink-0 mt-0.5">+</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Areas for Improvement */}
      {aiDebrief.areasForImprovement && aiDebrief.areasForImprovement.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-bold text-amber-400/60 tracking-wider uppercase mb-1.5">Areas for Improvement</p>
          <ul className="space-y-1">
            {aiDebrief.areasForImprovement.map((s, i) => (
              <li key={i} className="text-xs text-text-secondary leading-relaxed flex gap-2">
                <span className="text-amber-400/50 shrink-0 mt-0.5">→</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lessons */}
      {aiDebrief.specificLessons && aiDebrief.specificLessons.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-bold text-text-muted/60 tracking-wider uppercase mb-1.5">Lessons</p>
          <div className="space-y-2">
            {aiDebrief.specificLessons.map((lesson, i) => (
              <div key={i} className="bg-white/3 rounded-lg p-2.5">
                <p className="text-xs text-text-secondary leading-relaxed">{lesson.observation}</p>
                <p className="text-[11px] text-text-muted leading-relaxed mt-1 italic">{lesson.lesson}</p>
                {lesson.reference && (
                  <p className="text-[10px] text-text-muted/50 mt-1">— {lesson.reference}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What-If */}
      {aiDebrief.whatIfScenario && (
        <div className="mt-3">
          <p className="text-[10px] font-bold text-text-muted/60 tracking-wider uppercase mb-1.5">What If</p>
          <p className="text-xs text-text-muted italic leading-relaxed">{aiDebrief.whatIfScenario}</p>
        </div>
      )}
    </div>
  );
}
