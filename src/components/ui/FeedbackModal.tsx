import { useState, useEffect, useCallback } from 'react';
import { Modal } from './Modal';
import { useToastStore } from '../../hooks/useToast';
import { getDeviceType, getPlayerId } from '../../utils/device';

type FeedbackType = 'bug' | 'feature' | 'other';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: {
    screen: 'intro' | 'game' | 'gameover';
    round?: number;
    difficulty?: string;
    duration?: string;
    holdcoName?: string;
  };
}

const TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: 'bug', label: '🐛 Bug' },
  { value: 'feature', label: '💡 Feature' },
  { value: 'other', label: '💬 Other' },
];

export function FeedbackModal({ isOpen, onClose, context }: FeedbackModalProps) {
  const [type, setType] = useState<FeedbackType>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const addToast = useToastStore(s => s.addToast);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setType('bug');
      setMessage('');
      setEmail('');
      setError('');
    }
  }, [isOpen]);

  const scrollInputIntoView = useCallback((e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const el = e.target;
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  }, []);

  const canSubmit = message.trim().length >= 10 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          message: message.trim(),
          email: email.trim() || undefined,
          context: {
            ...context,
            device: getDeviceType(),
            playerId: getPlayerId(),
          },
        }),
      });

      if (res.status === 429) {
        setError('Please wait before submitting again.');
        return;
      }

      if (!res.ok) {
        setError('Something went wrong. Please try again.');
        return;
      }

      addToast({ message: 'Thanks for your feedback!', type: 'success' });
      setMessage('');
      setEmail('');
      setType('bug');
      onClose();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send Feedback" size="sm">
      {/* Type pills */}
      <div className="flex gap-2 mb-4">
        {TYPE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setType(opt.value)}
            className={`px-4 py-2 min-h-[44px] rounded-full text-sm font-medium transition-colors ${
              type === opt.value
                ? 'bg-accent text-white'
                : 'bg-white/10 text-text-muted hover:text-text-primary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Message */}
      <div className="mb-4">
        <label htmlFor="feedback-message" className="block text-xs text-text-muted mb-1">
          Message <span className="text-danger">*</span>
        </label>
        <textarea
          id="feedback-message"
          value={message}
          onChange={e => setMessage(e.target.value.slice(0, 1000))}
          placeholder={
            type === 'bug' ? 'Describe what happened and what you expected...' :
            type === 'feature' ? 'What would make the game better?' :
            'Share your thoughts...'
          }
          rows={4}
          onFocus={scrollInputIntoView}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 resize-none"
        />
        <p className="text-xs text-text-muted mt-1 text-right">
          {message.trim().length}/1000
          {message.trim().length > 0 && message.trim().length < 10 && (
            <span className="text-warning ml-2">Min 10 characters</span>
          )}
        </p>
      </div>

      {/* Email (optional) */}
      <div className="mb-5">
        <label htmlFor="feedback-email" className="block text-xs text-text-muted mb-1">
          Email <span className="text-text-muted/50">(optional, for follow-up)</span>
        </label>
        <input
          id="feedback-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value.slice(0, 100))}
          placeholder="you@example.com"
          onFocus={scrollInputIntoView}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-danger text-sm mb-3">{error}</p>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full btn-primary py-3 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? 'Sending...' : 'Send Feedback'}
      </button>
    </Modal>
  );
}
