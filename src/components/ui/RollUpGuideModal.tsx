interface RollUpGuideModalProps {
  onClose: () => void;
}

export function RollUpGuideModal({ onClose }: RollUpGuideModalProps) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-bg-primary border border-white/10 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Roll-Up Strategy Guide</h2>
            <p className="text-text-muted">The PE playbook for multiple expansion</p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-2xl"
          >
            ×
          </button>
        </div>

        {/* What is a Roll-Up */}
        <div className="card mb-6">
          <h3 className="font-bold text-lg mb-3">What is a Roll-Up?</h3>
          <p className="text-text-secondary text-sm leading-relaxed">
            A roll-up is a private equity strategy where you acquire a "platform" company and then
            bolt on smaller competitors in the same sector. The combined entity commands a higher
            valuation multiple than the sum of its parts - this is called <span className="text-accent font-medium">multiple expansion</span>.
          </p>
          <p className="text-text-muted text-sm mt-3 italic">
            Examples: Constellation Software, TransDigm, Danaher, HVAC roll-ups
          </p>
        </div>

        {/* How it Works */}
        <div className="card mb-6">
          <h3 className="font-bold text-lg mb-4">How It Works</h3>

          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold shrink-0">1</div>
              <div>
                <p className="font-medium">Designate a Platform</p>
                <p className="text-text-muted text-sm">
                  Choose a high-quality business to be your platform. Costs 5% of EBITDA to set up
                  the infrastructure for bolt-on integration.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold shrink-0">2</div>
              <div>
                <p className="font-medium">Acquire Tuck-Ins</p>
                <p className="text-text-muted text-sm">
                  Look for "Tuck-In" deals in the same sector. These smaller businesses can be
                  folded into your platform, consolidating their EBITDA.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold shrink-0">3</div>
              <div>
                <p className="font-medium">Realize Synergies</p>
                <p className="text-text-muted text-sm">
                  Integration outcomes determine synergies. Success adds 10-20% EBITDA;
                  partial success adds ~5%; failure can drag EBITDA down.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold shrink-0">4</div>
              <div>
                <p className="font-medium">Exit at Premium</p>
                <p className="text-text-muted text-sm">
                  Platforms with scale command higher exit multiples. A scale-3 platform can
                  add +0.9x to your exit multiple.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Platform Scale */}
        <div className="card mb-6">
          <h3 className="font-bold text-lg mb-4">Platform Scale & Multiple Expansion</h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 text-text-muted font-medium">Scale</th>
                  <th className="text-left py-2 text-text-muted font-medium">How to Reach</th>
                  <th className="text-right py-2 text-text-muted font-medium">Exit Multiple Bonus</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/10">
                  <td className="py-3">
                    <span className="bg-accent/20 text-accent px-2 py-1 rounded text-xs font-medium">Scale 1</span>
                  </td>
                  <td className="py-3 text-text-secondary">Designate as platform</td>
                  <td className="py-3 text-right font-mono">+0.3x</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-3">
                    <span className="bg-accent/20 text-accent px-2 py-1 rounded text-xs font-medium">Scale 2</span>
                  </td>
                  <td className="py-3 text-text-secondary">1 tuck-in or merge</td>
                  <td className="py-3 text-right font-mono">+0.6x</td>
                </tr>
                <tr>
                  <td className="py-3">
                    <span className="bg-accent/20 text-accent px-2 py-1 rounded text-xs font-medium">Scale 3</span>
                  </td>
                  <td className="py-3 text-text-secondary">2+ tuck-ins or merges</td>
                  <td className="py-3 text-right font-mono">+0.9x</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Integration Outcomes */}
        <div className="card mb-6">
          <h3 className="font-bold text-lg mb-4">Integration Outcomes</h3>
          <p className="text-text-muted text-sm mb-4">
            When you tuck-in or merge, integration success depends on quality ratings,
            operator strength, and whether you have shared services active.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
              <p className="text-green-400 font-bold">Success</p>
              <p className="text-xl font-mono mt-1">+10-20%</p>
              <p className="text-text-muted text-xs mt-1">EBITDA synergy</p>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-center">
              <p className="text-yellow-400 font-bold">Partial</p>
              <p className="text-xl font-mono mt-1">+5%</p>
              <p className="text-text-muted text-xs mt-1">EBITDA synergy</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
              <p className="text-red-400 font-bold">Failed</p>
              <p className="text-xl font-mono mt-1">-5-10%</p>
              <p className="text-text-muted text-xs mt-1">EBITDA drag</p>
            </div>
          </div>
        </div>

        {/* Merge vs Tuck-In */}
        <div className="card mb-6">
          <h3 className="font-bold text-lg mb-4">Merge vs Tuck-In</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-lg p-4">
              <h4 className="font-bold text-accent-secondary mb-2">Tuck-In</h4>
              <ul className="text-sm text-text-secondary space-y-1">
                <li>* Acquire from deal pipeline</li>
                <li>* Fold into existing platform</li>
                <li>* Smaller businesses (discounted)</li>
                <li>* Faster integration (1 year)</li>
              </ul>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <h4 className="font-bold text-accent mb-2">Merge</h4>
              <ul className="text-sm text-text-secondary space-y-1">
                <li>* Combine 2 owned businesses</li>
                <li>* Must be same sector</li>
                <li>* Creates new platform</li>
                <li>* Costs 10% of combined EBITDA</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
          <h3 className="font-bold mb-2">Pro Tips</h3>
          <ul className="text-sm text-text-secondary space-y-2">
            <li>
              <span className="text-accent">*</span> Unlock Shared Services before aggressive roll-ups - they improve integration success rates.
            </li>
            <li>
              <span className="text-accent">*</span> Focus on one sector for roll-ups. Sector focus bonus + platform scale = maximum multiple expansion.
            </li>
            <li>
              <span className="text-accent">*</span> Higher quality platforms have better integration outcomes. Start with a 4+ quality business.
            </li>
            <li>
              <span className="text-accent">*</span> Set your M&A Focus to your platform's sector to see more tuck-in opportunities.
            </li>
          </ul>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="btn-primary px-6">
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
