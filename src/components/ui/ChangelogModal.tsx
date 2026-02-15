import { Modal } from './Modal';
import { CHANGELOG } from '../../data/changelog';

interface ChangelogModalProps {
  onClose: () => void;
}

export function ChangelogModal({ onClose }: ChangelogModalProps) {
  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="What's New"
      subtitle="Player-facing release notes"
      size="lg"
    >
      <div className="space-y-8">
        {CHANGELOG.map((entry, i) => (
          <div key={i}>
            {i > 0 && <div className="border-t border-white/10 mb-8" />}

            {/* Date badge + title */}
            <div className="mb-4">
              <span className="inline-block text-xs font-medium px-2 py-0.5 rounded bg-accent/20 text-accent mb-2">
                {entry.date}
              </span>
              <h2 className="text-lg font-bold text-white">{entry.title}</h2>
            </div>

            {/* Sections */}
            <div className="space-y-5">
              {entry.sections.map((section, si) => (
                <div key={si}>
                  <h3 className="text-sm font-semibold text-white mb-2">{section.heading}</h3>
                  <ul className="list-disc list-inside text-sm text-gray-300 space-y-1.5 pl-1">
                    {section.items.map((item, ii) => (
                      <li key={ii}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
