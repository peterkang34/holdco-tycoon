import { Modal } from './Modal';
import { useAuthStore } from '../../hooks/useAuth';

export function TermsOfServiceModal() {
  const { showTermsModal, closeTermsModal } = useAuthStore();

  return (
    <Modal isOpen={showTermsModal} onClose={closeTermsModal} title="Terms of Service" size="sm">
      <div className="space-y-5 text-sm">
        <section>
          <h3 className="font-bold text-text-primary mb-1">What Holdco Tycoon Is</h3>
          <p className="text-text-secondary">
            Holdco Tycoon is a free browser-based strategy simulation game. It is not financial advice, investment guidance, or a substitute for professional counsel. All scenarios, returns, and outcomes are fictional and simplified for gameplay purposes.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-text-primary mb-1">Your Account</h3>
          <p className="text-text-secondary">
            You may play anonymously or create a free account. Accounts are personal and non-transferable. You are responsible for maintaining access to your email or Google account used for sign-in. We reserve the right to suspend accounts that abuse the service.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-text-primary mb-1">Game Data & Leaderboard</h3>
          <p className="text-text-secondary">
            Game results submitted to the leaderboard are public (initials, grade, and score only). We may remove leaderboard entries that appear fraudulent or manipulated. Your detailed game history and statistics are private and accessible only to you.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-text-primary mb-1">Acceptable Use</h3>
          <p className="text-text-secondary">
            Don't attempt to exploit, reverse-engineer, or interfere with the game's systems, leaderboard, or other players' data. Don't use automated tools to submit scores or manipulate rankings. Play fair — the leaderboard is for real gameplay.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-text-primary mb-1">Intellectual Property</h3>
          <p className="text-text-secondary">
            Holdco Tycoon, its mechanics, content, and design are the property of Peter Kang. The game is inspired by real-world holdco and PE concepts but all business names, scenarios, and AI-generated content are fictional.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-text-primary mb-1">Availability & Changes</h3>
          <p className="text-text-secondary">
            The game is provided as-is. We may update game mechanics, balance, features, or these terms at any time. We do not guarantee uptime or data permanence, though we make reasonable efforts to maintain both.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-text-primary mb-1">Limitation of Liability</h3>
          <p className="text-text-secondary">
            Holdco Tycoon is a free game. We are not liable for any decisions made based on gameplay, lost data, or service interruptions. Use the game for entertainment and education at your own discretion.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-text-primary mb-1">Contact</h3>
          <p className="text-text-secondary">
            Questions about these terms? Reach us at{' '}
            <a href="mailto:peter@peterkang.com" className="text-accent hover:underline">peter@peterkang.com</a>.
          </p>
        </section>

        <p className="text-text-muted text-xs pt-2">Last updated: March 2026</p>
      </div>
    </Modal>
  );
}
