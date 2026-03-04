import { Modal } from './Modal';
import { useAuthStore } from '../../hooks/useAuth';

export function PrivacyPolicyModal() {
  const { showPrivacyModal, closePrivacyModal } = useAuthStore();

  return (
    <Modal isOpen={showPrivacyModal} onClose={closePrivacyModal} title="Privacy Policy" size="sm">
      <div className="space-y-5 text-sm">
        <section>
          <h3 className="font-bold text-text-primary mb-1">Data We Collect</h3>
          <p className="text-text-secondary">
            Game results (scores, grades, strategy data), optional email address for account creation, and basic session data for authentication.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-text-primary mb-1">How We Store It</h3>
          <p className="text-text-secondary">
            Game data stored in Supabase (PostgreSQL). Leaderboard cached in Vercel KV (Redis). All data hosted on secure cloud infrastructure.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-text-primary mb-1">What's Public</h3>
          <p className="text-text-secondary">
            Leaderboard entries show: initials, grade, FEV score, and date only. No email or personal information is displayed publicly.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-text-primary mb-1">What's Private</h3>
          <p className="text-text-secondary">
            Your game history, detailed statistics, email address, and account information are private and only visible to you.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-text-primary mb-1">Data Retention</h3>
          <p className="text-text-secondary">
            Account data kept until you delete your account. Anonymous sessions with no games are automatically cleaned up after 90 days of inactivity.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-text-primary mb-1">Your Rights</h3>
          <p className="text-text-secondary">
            Export all your data anytime (JSON format) from the account menu. Delete your account and all associated data from the account menu. Leaderboard entries remain but become anonymous after deletion.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-text-primary mb-1">Tracking & Ads</h3>
          <p className="text-text-secondary">
            No advertising. No third-party trackers. No data sold to anyone. Basic analytics for game improvement only.
          </p>
        </section>

        <p className="text-text-muted text-xs pt-2">Last updated: March 2026</p>
      </div>
    </Modal>
  );
}
