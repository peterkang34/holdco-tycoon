import { useState, useEffect } from 'react';
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  isAIEnabled,
  setAIEnabled,
  validateApiKey,
} from '../../services/aiGeneration';

interface AISettingsModalProps {
  onClose: () => void;
}

export function AISettingsModal({ onClose }: AISettingsModalProps) {
  const [apiKey, setApiKeyState] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    const existingKey = getApiKey();
    setHasKey(!!existingKey);
    setEnabled(isAIEnabled());
    if (existingKey) {
      // Show masked version
      setApiKeyState('sk-ant-••••••••••••••••');
    }
  }, []);

  const handleSaveKey = async () => {
    if (!apiKey || apiKey.startsWith('sk-ant-••')) return;

    setValidating(true);
    setValidationResult(null);

    const isValid = await validateApiKey(apiKey);

    if (isValid) {
      setApiKey(apiKey);
      setHasKey(true);
      setApiKeyState('sk-ant-••••••••••••••••');
      setValidationResult('success');
      setAIEnabled(true);
      setEnabled(true);
    } else {
      setValidationResult('error');
    }

    setValidating(false);
  };

  const handleClearKey = () => {
    clearApiKey();
    setApiKeyState('');
    setHasKey(false);
    setEnabled(false);
    setAIEnabled(false);
    setValidationResult(null);
  };

  const handleToggleEnabled = () => {
    if (!hasKey) return;
    const newValue = !enabled;
    setEnabled(newValue);
    setAIEnabled(newValue);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-bg-primary border border-white/10 rounded-xl max-w-lg w-full p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold">AI-Enhanced Deals</h3>
            <p className="text-text-muted text-sm">Generate rich, unique M&A opportunities</p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-2xl"
          >
            ×
          </button>
        </div>

        {/* Feature Description */}
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-6">
          <h4 className="font-bold text-accent mb-2">What AI Adds</h4>
          <ul className="text-sm text-text-secondary space-y-1">
            <li>• Unique company backstories and founding history</li>
            <li>• Realistic seller motivations (retirement, burnout, disputes)</li>
            <li>• Interesting quirks and details about each business</li>
            <li>• Hidden red flags and upside opportunities</li>
          </ul>
        </div>

        {/* API Key Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">
            Anthropic API Key
          </label>
          <div className="flex gap-2">
            <input
              type={hasKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKeyState(e.target.value);
                setValidationResult(null);
              }}
              placeholder="sk-ant-..."
              disabled={hasKey}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
            />
            {hasKey ? (
              <button
                onClick={handleClearKey}
                className="btn-secondary text-sm px-4"
              >
                Remove
              </button>
            ) : (
              <button
                onClick={handleSaveKey}
                disabled={!apiKey || validating}
                className="btn-primary text-sm px-4"
              >
                {validating ? 'Checking...' : 'Save'}
              </button>
            )}
          </div>

          {validationResult === 'success' && (
            <p className="text-accent text-sm mt-2">API key validated successfully!</p>
          )}
          {validationResult === 'error' && (
            <p className="text-danger text-sm mt-2">Invalid API key. Please check and try again.</p>
          )}

          <p className="text-xs text-text-muted mt-2">
            Your API key is stored locally in your browser and never sent to our servers.
            Get a key at{' '}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              console.anthropic.com
            </a>
          </p>
        </div>

        {/* Enable/Disable Toggle */}
        {hasKey && (
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg mb-6">
            <div>
              <p className="font-medium">AI Generation</p>
              <p className="text-sm text-text-muted">
                {enabled ? 'New deals will include AI-generated content' : 'Using static content for deals'}
              </p>
            </div>
            <button
              onClick={handleToggleEnabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? 'bg-accent' : 'bg-white/20'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}

        {/* Cost Notice */}
        <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg text-sm">
          <p className="text-warning font-medium mb-1">API Usage</p>
          <p className="text-text-muted">
            Each deal uses ~500 tokens with Claude Haiku (~$0.0003/deal). A typical game generates
            ~100 deals, costing approximately $0.03.
          </p>
        </div>

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="btn-primary px-6">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
