import { useState, useEffect } from 'react';
import type { PlaybookData } from '../../engine/types';
import { OperatorPlaybook } from '../gameover/OperatorPlaybook';
import { getArchetypeDisplayName } from '../../utils/playbookThesis';

interface PlaybookScreenProps {
  shareId: string;
  onBack: () => void;
}

/**
 * Standalone playbook page for shared links (?pb=SHARE_ID).
 * Fetches the playbook from the public API and renders it in the overlay.
 */
export function PlaybookScreen({ shareId, onBack }: PlaybookScreenProps) {
  const [playbook, setPlaybook] = useState<PlaybookData | null>(null);
  const [aiDebrief, setAIDebrief] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(`/api/player/playbook/${shareId}`)
      .then(res => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then(data => {
        if (!cancelled) {
          setPlaybook(data.playbook);
          setAIDebrief(data.aiDebrief ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [shareId]);

  // Set noindex meta tag
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-text-muted">Loading playbook...</p>
      </div>
    );
  }

  if (error || !playbook) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-text-muted">This playbook doesn't exist or has been removed.</p>
        <button
          onClick={onBack}
          className="text-accent hover:underline text-sm"
        >
          Go to Holdco Tycoon
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Minimal header */}
      <div className="border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <button onClick={onBack} className="text-accent text-sm hover:underline">
          Play Holdco Tycoon
        </button>
        <p className="text-text-muted text-xs">
          {playbook.thesis.holdcoName} — {getArchetypeDisplayName(playbook.thesis.archetype)}
        </p>
      </div>

      {/* Playbook content rendered in always-open overlay */}
      <OperatorPlaybook
        isOpen={true}
        onClose={onBack}
        playbook={playbook}
        aiDebrief={aiDebrief}
      />
    </div>
  );
}
