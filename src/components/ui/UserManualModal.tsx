import { useState, useMemo, useEffect } from 'react';
import { Modal } from './Modal';
import { trackFeatureUsed } from '../../services/telemetry';

type ManualSection =
  | 'getting-started'
  | 'game-loop'
  | 'acquiring'
  | 'operations'
  | 'financial'
  | 'distress'
  | 'platforms'
  | 'turnarounds'
  | 'shared-services'
  | 'selling'
  | 'events'
  | 'twenty-year'
  | 'scoring'
  | 'sectors'
  | 'strategy'
  | 'glossary';

interface SectionDef {
  id: ManualSection;
  label: string;
  shortLabel: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'getting-started', label: 'Getting Started', shortLabel: 'Start' },
  { id: 'game-loop', label: 'The Game Loop', shortLabel: 'Loop' },
  { id: 'acquiring', label: 'Acquiring Businesses', shortLabel: 'Acquire' },
  { id: 'operations', label: 'Business Operations', shortLabel: 'Ops' },
  { id: 'financial', label: 'Financial Management', shortLabel: 'Finance' },
  { id: 'distress', label: 'Distress & Covenants', shortLabel: 'Distress' },
  { id: 'platforms', label: 'Platform Building', shortLabel: 'Platforms' },
  { id: 'turnarounds', label: 'Turnaround Programs', shortLabel: 'Turnaround' },
  { id: 'shared-services', label: 'Shared Services', shortLabel: 'Services' },
  { id: 'selling', label: 'Selling & Exit', shortLabel: 'Exit' },
  { id: 'events', label: 'Events', shortLabel: 'Events' },
  { id: 'twenty-year', label: '20-Year Mode', shortLabel: '20-Year' },
  { id: 'scoring', label: 'Scoring & Leaderboard', shortLabel: 'Scoring' },
  { id: 'sectors', label: 'The 15 Sectors', shortLabel: 'Sectors' },
  { id: 'strategy', label: 'Tips & Strategy', shortLabel: 'Tips' },
  { id: 'glossary', label: 'Glossary', shortLabel: 'Glossary' },
];

interface UserManualModalProps {
  onClose: () => void;
}

// --- Helper components for consistent styling ---

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold text-white mb-4">{children}</h2>;
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-white mt-6 mb-2">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-300 mb-3 leading-relaxed">{children}</p>;
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc list-inside text-sm text-gray-300 mb-4 space-y-1.5 pl-1">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function HighlightBox({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'info' | 'warning' | 'tip' }) {
  const colors = {
    info: 'border-accent/30 bg-accent/5',
    warning: 'border-orange-500/30 bg-orange-500/5',
    tip: 'border-emerald-500/30 bg-emerald-500/5',
  };
  return (
    <div className={`border rounded-lg p-3 mb-4 text-sm text-gray-300 ${colors[variant]}`}>
      {children}
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm text-gray-300 border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="text-left py-1.5 px-2 border-b border-white/10 text-white font-semibold text-xs whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-white/[0.02]' : ''}>
              {row.map((cell, ci) => (
                <td key={ci} className={`py-1.5 px-2 border-b border-white/5 ${ci === 0 ? 'whitespace-nowrap' : ''}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Section content renderers ---

function GettingStartedContent() {
  return (
    <>
      <SectionTitle>Getting Started</SectionTitle>
      <P>
        Welcome to Holdco Tycoon. You play as the CEO of a newly formed holding company.
        Your goal is to acquire, operate, and grow a portfolio of small businesses over a
        multi-year period, compounding value through smart capital allocation, operational
        improvements, and strategic platform building.
      </P>
      <P>
        Think of yourself as a serial acquirer in the vein of Constellation Software, Danaher,
        or TransDigm. Every dollar you deploy should earn a return above your cost of capital.
      </P>

      <SubHeading>Choosing Your Mode</SubHeading>
      <P>You will select a difficulty and a duration when starting a new game:</P>

      <DataTable
        headers={['Setting', 'Easy (Institutional Capital)', 'Normal (Self-Funded)']}
        rows={[
          ['Starting Capital', '$20M', '$5M ($2M equity + $3M debt)'],
          ['Founder Ownership', '80%', '100%'],
          ['Starting Debt', 'None', '$3M bank debt'],
          ['First Business EBITDA', '~$1M', '~$800K'],
          ['Leaderboard Multiplier', '0.9x', '1.35x (rewards harder start)'],
        ]}
      />

      <DataTable
        headers={['Duration', 'Rounds', 'Best For']}
        rows={[
          ['Full Game', '20 years', 'Deep strategy, platform building, long-term compounding'],
          ['Quick Play', '10 years', 'Faster sessions, tighter capital discipline'],
        ]}
      />

      <SubHeading>Your First Year</SubHeading>
      <P>
        When you begin, you will pick a sector and receive your first business. From there,
        the game enters the annual loop. Each year represents one round, and your job is to
        collect cash flows, respond to events, and allocate capital wisely.
      </P>
      <HighlightBox variant="tip">
        <strong>Tip:</strong> Your first business sets the tone. A quality-3 business in a
        stable sector gives you a solid foundation to build from, while a low-quality bargain
        might need attention before you can expand.
      </HighlightBox>
    </>
  );
}

function GameLoopContent() {
  return (
    <>
      <SectionTitle>The Game Loop</SectionTitle>
      <P>
        Each year (round) follows a fixed sequence of phases. You progress through them in order,
        making decisions that shape your holdco&apos;s trajectory.
      </P>

      <SubHeading>1. Collect Phase</SubHeading>
      <P>
        Your businesses generate EBITDA (earnings). From this cash flow, the game automatically
        deducts debt service (interest + amortization), CapEx, shared services costs, and taxes
        (30% rate with interest deductions). The remaining cash is added to your treasury.
      </P>
      <HighlightBox>
        <strong>Cash Flow Waterfall:</strong> Gross EBITDA &rarr; minus CapEx &rarr; minus
        debt service &rarr; minus shared services costs &rarr; minus taxes = Net Cash Flow
      </HighlightBox>

      <SubHeading>2. Restructure Phase (Conditional)</SubHeading>
      <P>
        If you are in covenant breach, you enter a mandatory restructuring phase before events.
        Here you can perform a distressed sale, raise emergency equity, or declare bankruptcy.
        You must resolve the breach (reduce ND/E below 4.5x) before you can continue.
        Restructuring imposes a permanent <strong>-20% penalty</strong> on your final FEV.
      </P>

      <SubHeading>3. Event Phase</SubHeading>
      <P>
        A random event occurs each year. Events fall into two categories:
      </P>
      <BulletList items={[
        <><strong>Global events</strong> affect the entire economy: bull markets, recessions, interest rate changes, inflation, credit tightening.</>,
        <><strong>Portfolio events</strong> affect one of your businesses: talent changes, customer wins/losses, breakthroughs, compliance issues, unsolicited offers.</>,
      ]} />
      <P>
        Some events present choices (accept/decline an offer, grant/deny an equity demand).
        Others apply their effects automatically.
      </P>

      <SubHeading>4. Allocate Phase</SubHeading>
      <P>
        This is where you make all of your strategic decisions for the year. You can:
      </P>
      <BulletList items={[
        'Acquire new businesses from the deal pipeline',
        'Sell underperforming businesses',
        'Apply operational improvements',
        'Unlock or deactivate shared services',
        'Forge integrated platforms',
        'Start turnaround programs',
        'Pay down debt, raise equity, buy back shares, or distribute cash',
        'Refresh the deal pipeline (Source Deals)',
      ]} />

      <SubHeading>5. End Year</SubHeading>
      <P>
        After you finish allocating, the year ends. Revenue growth and margin drift are applied
        to each business. Turnaround programs advance. Integration timers tick down.
        Metrics are updated and recorded for your annual report. The game then advances to
        the next year and the cycle repeats.
      </P>
    </>
  );
}

function AcquiringContent() {
  return (
    <>
      <SectionTitle>Acquiring Businesses</SectionTitle>

      <SubHeading>The Deal Pipeline</SubHeading>
      <P>
        Each round, you receive 3-5 deals in your pipeline. Deals have a freshness timer (1-3
        rounds) and expire if not acted upon. You can pass on deals to hide them &mdash; passed deals
        stay hidden until they expire. Deals come from various sources: inbound, brokered,
        sourced, or proprietary (the rarest and best).
      </P>

      <SubHeading>Deal Size Tiers</SubHeading>
      <P>
        Deals are categorized into 7 tiers based on EBITDA. The deals you see scale with what you can
        afford &mdash; your cash multiplied by leverage, with a random stretch factor each round.
        Higher tiers have quality floors and entry multiple premiums that compress returns.
      </P>
      <DataTable
        headers={['Tier', 'EBITDA Range', 'Quality Floor', 'Multiple Adder']}
        rows={[
          ['Micro', '$500K-$1.5M', 'None', '+0.0x'],
          ['Small', '$1.5M-$4M', 'None', '+0.0x'],
          ['Mid-Market', '$4M-$10M', 'None', '+0.0x'],
          ['Upper-Mid', '$10M-$25M', 'Q2+', '+0.5x'],
          ['Institutional', '$25M-$50M', 'Q3+', '+1.0x'],
          ['Marquee', '$50M-$75M', 'Q3+', '+1.5x'],
          ['Trophy', '$75M+', 'Q4+', '+2.0x'],
        ]}
      />
      <P>
        Use M&amp;A Focus to target a specific tier. Higher tiers appear less frequently in the
        pipeline &mdash; Trophy deals are capped at 1-2 per round regardless of your wealth.
      </P>

      <SubHeading>Deal Heat</SubHeading>
      <P>
        Each deal has a competitive heat level that affects the effective price you pay:
      </P>
      <BulletList items={[
        <><strong>Cold:</strong> No competition. You pay the asking price or less.</>,
        <><strong>Warm:</strong> Some interest from other buyers. Small premium.</>,
        <><strong>Hot:</strong> Multiple bidders. Notable premium on the asking price.</>,
        <><strong>Contested:</strong> Full auction. Significant premium. Risk of being outbid.</>,
      ]} />
      <P>
        In contested and hot deals, there is a chance your acquisition attempt gets &ldquo;snatched&rdquo;
        by a competing buyer. Proprietary deal flow from M&A Sourcing reduces this risk.
      </P>

      <SubHeading>Deal Structures</SubHeading>
      <P>Six deal structures are available depending on the deal and your financial position:</P>
      <DataTable
        headers={['Structure', 'Equity %', 'Debt/Other %', 'Risk', 'Notes']}
        rows={[
          ['All Cash', '100%', '0%', 'Low', 'No leverage; requires full cash on hand'],
          ['Seller Note', '40%', '60% seller note', 'Medium', 'Seller financing at 5-6% interest'],
          ['Bank Debt', '35%', '65% bank debt', 'High', 'At current interest rate; not available during credit tightening'],
          ['Earn-out', '55%', '45% contingent', 'Medium', 'Contingent on EBITDA growth targets; 4yr window; available for Q3+ deals'],
          ['LBO', '25%', '35% note + 40% bank', 'High', 'Maximum leverage; not available during credit tightening'],
          ['Rollover Equity', '65%', '25% rollover + 10% note', 'Low', 'Seller reinvests equity at 5% note rate; requires M&A Sourcing Tier 2+, Q3+; not available during financial stress'],
        ]}
      />

      <SubHeading>Rollover Equity</SubHeading>
      <P>
        The most common PE acquisition structure in the lower-middle-market. The seller &ldquo;sells&rdquo; 100%
        but immediately reinvests ~25% of proceeds back as equity, keeping them aligned with your success.
      </P>
      <BulletList items={[
        'Standard mode: 65% cash / 25% rollover / 10% seller note. Quick mode: 70% / 20% / 10%',
        'Requires M&A Sourcing Tier 2+ and Quality 3+. Not available for distressed sellers, burnt-out operators, or during financial stress',
        'Growth bonus: +1.5% (standard) or +2.0% (quick) revenue and organic growth. Margin bonus: +0.5%',
        'At exit, seller receives their rollover % of net proceeds (after debt payoff)',
        'Best for capital-efficient strategies — deploy less cash per deal while keeping the seller motivated',
      ]} />

      <SubHeading>Quality Ratings</SubHeading>
      <P>
        Every business has a quality rating from 1 to 5 stars. Quality is the single most
        important attribute of a deal &mdash; it drives the due diligence signals you see,
        the seller archetype you encounter, and the financial profile of the business.
      </P>
      <DataTable
        headers={['Quality', 'Margin', 'Growth', 'Acq Multiple', 'Exit Premium']}
        rows={[
          ['Q5 Best-in-Class', '+3.0 ppt', '+1.0 ppt', '+0.70x', '+0.8x'],
          ['Q4 Well-Run', '+1.5 ppt', '+0.5 ppt', '+0.35x', '+0.4x'],
          ['Q3 Solid', 'Baseline', 'Baseline', 'Baseline', '0'],
          ['Q2 Below Avg', '-1.5 ppt', '-0.5 ppt', '-0.35x', '-0.4x'],
          ['Q1 Struggling', '-3.0 ppt', '-1.0 ppt', '-0.70x', '-0.8x'],
        ]}
      />
      <P>
        Revenue is also scaled by quality: Q5 businesses generate ~120% of the sector range,
        while Q1 businesses generate ~80%. Quality 1-2 businesses are turnaround candidates
        that can be improved through turnaround programs (see the Turnaround Programs section).
      </P>

      <SubHeading>Due Diligence Signals</SubHeading>
      <P>
        Each deal shows five due diligence signals. These are
        <strong> direct indicators of the underlying quality rating</strong>. Learning to read
        them helps you evaluate deals even before checking the star count:
      </P>
      <DataTable
        headers={['Signal', 'Q4-5', 'Q2-3', 'Q1']}
        rows={[
          ['Operator Quality', 'Strong', 'Moderate', 'Weak'],
          ['Trend', 'Growing', 'Flat or Growing', 'Flat or Declining'],
          ['Retention', '90-98%', '75-92%', '65-78%'],
          ['Competition', 'Leader / Competitive', 'Competitive / Commoditized', 'Commoditized'],
          ['Revenue Conc.', 'Low to Medium', 'Medium (varies by sector)', 'High'],
        ]}
      />
      <P>
        <strong>How each signal affects gameplay:</strong>
      </P>
      <BulletList items={[
        <><strong>Operator Quality</strong> is the most impactful signal. It directly affects integration: Strong = 1-year integration + 15% success bonus + 0.3x exit de-risking premium. Weak = 3-year integration - 15% success penalty.</>,
        <><strong>Revenue Concentration</strong> affects exit multiples: low concentration adds +0.3x de-risking premium at exit. High concentration carries event risk (client loss).</>,
        <><strong>Customer Retention</strong> of 90%+ adds +0.2x de-risking premium at exit. Retention also signals organic revenue stability.</>,
        <><strong>Competitive Position</strong> affects the acquisition multiple: +0.3x for market leaders, -0.3x for commoditized businesses. This flows into exit valuation as a higher base multiple.</>,
        <><strong>Trend</strong> signals the business&rsquo;s current growth trajectory. Growing businesses have higher organic growth rates built in (+2 ppt).</>,
      ]} />

      <SubHeading>Seller Archetypes</SubHeading>
      <P>
        Every deal features one of six seller archetypes. Like due diligence signals, archetypes
        are correlated with quality: high-quality businesses attract better seller situations,
        while low-quality businesses trend toward distressed or burnt-out sellers.
      </P>
      <DataTable
        headers={['Archetype', 'Price', 'Heat', 'Operator']}
        rows={[
          ['Retiring Founder', '0 to +5%', '-1 tier', 'Str / Mod'],
          ['MBO Candidate', '0 to +5%', 'No change', 'Strong'],
          ['Ex-Franchise', '+5 to +10%', 'No change', 'Str / Mod'],
          ['Divestiture', '+5 to +10%', '+1 tier', 'Moderate'],
          ['Burnt Out', '-5 to -10%', 'No change', 'Weak / Mod'],
          ['Distressed', '-10 to -20%', '-2 tiers', 'Weak'],
        ]}
      />
      <P>
        The archetype can override the due-diligence operator quality. For example, a Q3 business
        normally has a &ldquo;Moderate&rdquo; operator, but if the seller is an MBO Candidate,
        the operator is always &ldquo;Strong.&rdquo; This makes MBO deals more integration-friendly
        even at average quality. Conversely, a Distressed seller always has a &ldquo;Weak&rdquo;
        operator regardless of quality rating.
      </P>
      <BulletList items={[
        <><strong>Retiring Founder:</strong> Fair price, smooth transition. The classic &ldquo;aging owner&rdquo; scenario &mdash; good businesses with motivated sellers. More common at Q4-5.</>,
        <><strong>MBO Candidate:</strong> Management already runs the business. Strong operator is locked in, making integration almost guaranteed. Worth paying fair price. More common at Q4-5.</>,
        <><strong>Ex-Franchise:</strong> Former franchisee going independent. Slight premium but comes with +2% organic growth bonus and entrepreneurial energy.</>,
        <><strong>Divestiture:</strong> Parent company shedding a non-core division. Clean separation but you pay a premium and face more competition (higher heat).</>,
        <><strong>Burnt Out:</strong> Owner wants out. Discounted price but expect operational weakness &mdash; the business may need turnaround investment. Not eligible for rollover equity. More common at Q1-2.</>,
        <><strong>Distressed:</strong> Seller under financial pressure. Steep discount and low competition, but weak operations and higher integration risk. Not eligible for rollover equity. More common at Q1-2.</>,
      ]} />

      <SubHeading>Tuck-in Acquisitions</SubHeading>
      <P>
        If you have a business designated as a platform, you can acquire compatible businesses
        as bolt-on &ldquo;tuck-ins.&rdquo; Tuck-ins receive a quality-dependent price discount and
        integrate into the parent platform, sharing overhead and scaling the platform.
        Integration period depends on operator quality (1-3 years).
      </P>
      <DataTable
        headers={['Quality', 'Discount']}
        rows={[
          ['Q5 (Best)', '5%'],
          ['Q4', '10%'],
          ['Q3', '15%'],
          ['Q2', '20%'],
          ['Q1 (Worst)', '25%'],
        ]}
      />
      <P>
        The discount is applied to the asking price. For example, a Q2 business with a $5M asking
        price would cost $4M as a tuck-in (20% off). Lower quality businesses get steeper
        discounts because they carry more integration risk.
      </P>

      <SubHeading>Integration Quality</SubHeading>
      <P>
        When you acquire a business, an integration roll determines how smoothly it merges
        into your portfolio. The base success probability is 60%, modified by:
      </P>
      <BulletList items={[
        <><strong>Quality rating:</strong> &plusmn;10% per star above/below Q3</>,
        <><strong>Operator quality:</strong> Strong +15%, Weak -15%</>,
        <><strong>Same sector as platform:</strong> +15%</>,
        <><strong>Sub-type affinity:</strong> Related -5%, Distant -15%</>,
        <><strong>Shared Services active:</strong> +10%</>,
        <><strong>High customer concentration:</strong> -10%</>,
      ]} />
      <P>
        These modifiers are additive. For example, a Q4 business (+10%) with a strong
        operator (+15%) in the same sector (+15%) starts at 60% + 10% + 15% + 15% = 100%
        success probability before other factors.
      </P>
      <P>
        Three outcomes are possible, each with different synergy capture rates:
      </P>
      <DataTable
        headers={['Outcome', 'Tuck-in Synergy', 'Standalone Synergy', 'Merger Synergy']}
        rows={[
          ['Seamless (full synergies)', '20% of EBITDA', '10% of EBITDA', '15% of EBITDA'],
          ['Rocky (reduced synergies)', '8% of EBITDA', '3% of EBITDA', '5% of EBITDA'],
          ['Troubled (negative drag)', '-5% of EBITDA', '-10% of EBITDA', '-7% of EBITDA'],
        ]}
      />
      <P>
        <strong>What &ldquo;Rocky&rdquo; means in practice:</strong> A rocky integration captures
        roughly a third to two-fifths of the synergies you&apos;d get from a seamless one, depending
        on acquisition type (40% for tuck-ins, ~30% for standalones). You still come out ahead
        versus no acquisition, but the value creation is significantly dampened. For example, a
        tuck-in that would generate $100K in synergies on a seamless outcome only generates $40K
        on a rocky one.
      </P>
      <P>
        <strong>What &ldquo;Troubled&rdquo; means:</strong> A troubled integration actually
        destroys value &mdash; you suffer a 15% restructuring cost (12% for mergers) plus a
        proportional growth drag based on the relative size of the acquired company. The drag
        is larger when the bolt-on is big relative to the platform (up to 3.0ppt at 1:1 ratio),
        and smaller for tiny tuck-ins (minimum 0.2ppt). Mergers receive 67% of the tuck-in penalty.
        The drag decays by 50% each year (65% in quick games), typically vanishing in ~3 years.
      </P>
      <P>
        All newly acquired businesses also face a temporary integration penalty during the
        integration period (1-3 rounds depending on operator quality: strong = 1, moderate = 2,
        weak = 3). Each round, revenue growth is reduced by 3-8 percentage points (a fresh roll
        each year, not cumulative).
      </P>

      <SubHeading>Synergy Modifiers</SubHeading>
      <P>
        The base synergy rates above are further adjusted by sub-type affinity and size ratio:
      </P>
      <DataTable
        headers={['Modifier', 'Effect on Synergies']}
        rows={[
          ['Same sub-type', '100% (full synergy capture)'],
          ['Related sub-type', '75% of base synergies'],
          ['Distant sub-type', '45% of base synergies'],
        ]}
      />
      <P>
        <strong>Size ratio</strong> also matters for tuck-ins. If the bolt-on is too large
        relative to the platform, synergy capture drops:
      </P>
      <BulletList items={[
        <><strong>Ideal</strong> (bolt-on &le;50% of platform EBITDA): 100% synergy capture</>,
        <><strong>Stretch</strong> (50-100%): 80% synergy capture</>,
        <><strong>Strained</strong> (100-200%): 50% synergy capture</>,
        <><strong>Overreach</strong> (&gt;200%): 25% synergy capture</>,
      ]} />

      <HighlightBox variant="tip">
        <strong>Example:</strong> You tuck in a $500K EBITDA business (related sub-type, ideal size
        ratio) with a seamless integration. Synergies = $500K &times; 20% &times; 75% = $75K EBITDA boost.
        If that same tuck-in had a rocky outcome instead, synergies = $500K &times; 8% &times; 75% = $30K.
      </HighlightBox>
    </>
  );
}

function OperationsContent() {
  return (
    <>
      <SectionTitle>Business Operations</SectionTitle>

      <SubHeading>Revenue Growth</SubHeading>
      <P>
        Each business grows revenue annually based on several factors:
      </P>
      <BulletList items={[
        <><strong>Sector baseline:</strong> Each sector has an organic growth range (e.g., SaaS: 2-10%, Home Services: 1-6%)</>,
        <><strong>Quality bonus:</strong> Higher quality businesses tend to grow faster</>,
        <><strong>Shared services:</strong> Marketing &amp; Brand adds +1.5% growth (up to +2.5% for agency/consumer sectors)</>,
        <><strong>Operational improvements:</strong> Service expansion and other improvements boost growth</>,
        <><strong>Growth rate cap:</strong> Revenue growth is capped at 20% per year, and floored at -10%</>,
      ]} />

      <SubHeading>Margin Dynamics</SubHeading>
      <P>
        EBITDA margins naturally drift over time. Most sectors experience margin compression
        (negative drift), meaning margins slowly erode without active intervention.
      </P>
      <BulletList items={[
        <><strong>Margin drift:</strong> Varies by sector. Restaurants drift -0.8 to -1.5 ppt/year. SaaS drifts -0.3 to +0.2 ppt/year.</>,
        <><strong>Margin volatility:</strong> Random annual noise on top of drift</>,
        <><strong>Margin range:</strong> Clamped between 3% minimum and 80% maximum</>,
        <><strong>Shared services:</strong> Procurement reduces CapEx by 15%. Procurement, Technology, Recruiting, and Finance all slow margin erosion.</>,
      ]} />

      <SubHeading>EBITDA Floor</SubHeading>
      <HighlightBox>
        Businesses cannot fall below <strong>30%</strong> of their acquisition EBITDA. This floor
        prevents total collapse while still allowing significant underperformance.
      </HighlightBox>

      <SubHeading>CapEx Rates by Sector</SubHeading>
      <P>
        Capital expenditures vary significantly by sector and directly reduce cash flow:
      </P>
      <DataTable
        headers={['CapEx Rate', 'Sectors']}
        rows={[
          ['3%', 'Agency, Wealth Management'],
          ['4%', 'Insurance'],
          ['6%', 'B2B Services'],
          ['7%', 'Education'],
          ['10%', 'SaaS, Healthcare, Auto Services'],
          ['12%', 'Home Services, Restaurants, Distribution'],
          ['13%', 'Consumer Brands'],
          ['15%', 'Industrial'],
          ['16%', 'Environmental'],
          ['18%', 'Real Estate'],
        ]}
      />

      <SubHeading>Operational Improvements</SubHeading>
      <P>
        You can invest in operational improvements for each business. Each improvement has a one-time
        cost and provides immediate or ongoing benefits:
      </P>
      <BulletList items={[
        <><strong>Operating Playbook:</strong> Standardize operations</>,
        <><strong>Pricing Model:</strong> Optimize pricing strategy</>,
        <><strong>Service Expansion:</strong> Broaden offerings</>,
        <><strong>Fix Underperformance:</strong> Address specific weaknesses</>,
        <><strong>Recurring Revenue Conversion:</strong> Shift to subscription/recurring models (+0.50x exit premium)</>,
        <><strong>Management Professionalization:</strong> Upgrade management team (+0.30x exit premium)</>,
        <><strong>Digital Transformation:</strong> Modernize technology stack</>,
      ]} />
      <P>
        Each improvement also has a 30-55% chance of improving the business&apos;s quality rating by one tier
        (base 30% + turnaround tier bonus of 15-25%).
      </P>
    </>
  );
}

function FinancialContent() {
  return (
    <>
      <SectionTitle>Financial Management</SectionTitle>

      <SubHeading>Debt Types</SubHeading>
      <DataTable
        headers={['Type', 'Level', 'Rate', 'Notes']}
        rows={[
          ['Holdco Loan', 'Portfolio-level', '7% base', 'Equal annual installments (balance ÷ remaining years) + interest; can be paid down early in the Capital tab'],
          ['Seller Notes', 'Deal-level', '5-6%', 'Equal annual installments (balance ÷ remaining years) + interest; tied to individual acquisition'],
          ['Bank Debt', 'Per-business', '7% base', 'Equal annual installments (balance ÷ remaining years) + interest; can be paid down early; affected by events and distress penalties'],
          ['Earn-outs', 'Deal-level', 'N/A', 'Contingent payments based on EBITDA growth targets; expire after 4 years if not triggered'],
        ]}
      />

      <SubHeading>Interest Rate Dynamics</SubHeading>
      <P>The base interest rate is 7%. It fluctuates based on events and financial health:</P>
      <BulletList items={[
        'Interest rate hike events: +0.5%',
        'Interest rate cut events: -0.5%',
        'Covenant Watch (stressed): +1% penalty',
        'Covenant Breach: +2% penalty',
        'Tax rate is 30% on taxable income, with interest payments as deductions',
      ]} />

      <SubHeading>Equity Raises</SubHeading>
      <P>
        You can raise equity to inject cash, but it dilutes your founder ownership. Equity raises
        are limited:
      </P>
      <BulletList items={[
        'Each raise applies escalating dilution (10% more discount per prior raise, floor of 10% of intrinsic value)',
        'You must maintain majority control — ownership cannot drop below 51%',
        'There is no hard cap — but successive raises become increasingly expensive as you approach the 51% floor',
        '2-round cooldown between equity raises and buybacks',
        'New shares are issued at intrinsic value per share (minus escalating discount)',
      ]} />

      <SubHeading>Share Buybacks</SubHeading>
      <P>
        Buying back shares reduces shares outstanding and increases your founder ownership percentage.
        This is valuable when your shares are trading below intrinsic value and reinvestment
        opportunities are limited. Not available during covenant breach.
      </P>

      <SubHeading>Distributions</SubHeading>
      <P>
        You can distribute cash to all shareholders proportionally. Your founder share of
        distributions is tracked as Founder Personal Wealth, which is the secondary leaderboard
        metric. Distributions reduce your holdco&apos;s NAV but build personal wealth. Not available
        during covenant breach.
      </P>

      <HighlightBox variant="tip">
        <strong>Capital Allocation Hierarchy:</strong> Reinvest above hurdle rate first &rarr;
        Deleverage if needed &rarr; Buyback when shares are cheap &rarr; Distribute when no
        better use for cash. The scoring system rewards this discipline.
      </HighlightBox>
    </>
  );
}

function DistressContent() {
  return (
    <>
      <SectionTitle>Distress &amp; Covenants</SectionTitle>
      <P>
        Your leverage ratio (Net Debt / EBITDA) determines your financial health. As leverage
        increases, restrictions tighten and penalties grow:
      </P>

      <DataTable
        headers={['Level', 'Net Debt/EBITDA', 'Restrictions', 'Interest Penalty']}
        rows={[
          ['Healthy', '< 2.5x', 'None - full access to all actions', '+0%'],
          ['Elevated', '2.5x - 3.5x', 'None - but banks are watching closely', '+0%'],
          ['Covenant Watch', '3.5x - 4.5x', 'No new bank debt', '+1%'],
          ['Covenant Breach', '> 4.5x', 'No acquisitions, no distributions, no buybacks', '+2%'],
        ]}
      />

      <HighlightBox variant="warning">
        <strong>Bankruptcy Rule:</strong> If you remain in covenant breach for <strong>2
        cumulative years</strong> (consecutive or not after restructuring), you are forced
        into bankruptcy. This ends your game immediately with an F grade and a score of 0.
        Post-restructuring, breach years accumulate even if you temporarily exit breach —
        lenders don&apos;t reset the clock.
      </HighlightBox>

      <SubHeading>Restructuring Options</SubHeading>
      <P>
        When you enter the restructure phase (triggered by covenant breach), you have three options:
      </P>
      <BulletList items={[
        <><strong>Distressed Sale:</strong> Sell a business at a steep discount to raise cash and reduce leverage</>,
        <><strong>Emergency Equity Raise:</strong> Raise equity at a flat 50% discount to inject cash (triggers raise/buyback cooldown)</>,
        <><strong>Declare Bankruptcy:</strong> End the game immediately (F grade)</>,
      ]} />
      <HighlightBox variant="warning">
        <strong>Restructuring Penalty:</strong> Restructuring imposes a permanent <strong>-20% penalty</strong> on
        your final Founder Equity Value (FEV). It is a one-time lifeline — if you breach covenants
        or go cash-negative again after restructuring, it leads to automatic bankruptcy.
      </HighlightBox>

      <SubHeading>When EBITDA Goes to Zero</SubHeading>
      <P>
        If your total EBITDA drops to zero or below while you have debt, the system checks
        your solvency. If you have enough cash to cover your total debt, you enter Covenant Watch
        (stressed) — you can still make all-cash acquisitions to rebuild, but no new debt is available
        and you pay a 1% interest penalty. If your cash is below your total debt, it is a full
        covenant breach.
      </P>
    </>
  );
}

function PlatformsContent() {
  return (
    <>
      <SectionTitle>Platform Building</SectionTitle>
      <P>
        Platforms are the most powerful mechanic in the game. There are two types of platforms,
        each with distinct benefits.
      </P>

      <SubHeading>Manual Platforms</SubHeading>
      <P>
        You can designate any active business as a &ldquo;platform&rdquo; company (Scale 1). This lets it receive
        tuck-in acquisitions (bolt-ons) at a quality-dependent price discount (5-25%). Each tuck-in adds +1 scale.
        Alternatively, merging two companies jumps straight to Scale 2 (combining both scales + 2),
        reflecting the greater complexity of combining two businesses. Scale provides an exit multiple premium
        (logarithmic curve — ~+0.4x at Scale 1, ~+1.0x at Scale 5, continues growing) and multiple expansion (logarithmic — ~+0.5x at Scale 1, ~+1.0x at Scale 3, up to +2.0x for very large platforms).
      </P>

      <SubHeading>Integrated Platforms</SubHeading>
      <P>
        Integrated platforms are forged by combining 2 or more businesses with matching sub-types
        that fit a specific &ldquo;recipe.&rdquo; The game includes 38 platform recipes (32 within a single
        sector + 6 cross-sector). Forging a platform applies powerful one-time bonuses:
      </P>

      <DataTable
        headers={['Bonus Type', 'Range', 'How It Works']}
        rows={[
          ['Margin Boost', '+3 to +5 ppt', 'One-time permanent increase to EBITDA margins'],
          ['Growth Boost', '+1 to +4%', 'Added to revenue growth rate (persists)'],
          ['Multiple Expansion', '+1.0 to +2.0x', 'Premium on exit multiple for constituent businesses'],
          ['Recession Resistance', '0.75-0.85x', 'Reduces recession sensitivity for platform members'],
        ]}
      />
      <P>
        These bonuses are applied <strong>once at forge time</strong> as permanent mutations to each
        constituent business. For example, if a business has a 22% EBITDA margin and you forge a
        platform with a +4 ppt margin boost, it becomes 26% permanently. The growth boost works the
        same way &mdash; added directly to the business&apos;s base organic growth rate (before event
        modifiers). Multiple expansion and recession resistance are applied automatically at exit
        and during downturns.
      </P>
      <P>
        <strong>These are separate from acquisition synergies.</strong> Acquisition synergies (from
        the integration roll when you buy a business) and platform bonuses (from forging) stack
        independently. Both can benefit the same business. If you acquire a business and later forge
        a platform with it, the platform bonuses apply to the business&apos;s current margins and
        growth &mdash; including any synergies already captured from the acquisition.
      </P>

      <SubHeading>Integration Cost</SubHeading>
      <P>
        Forging a platform costs 18-25% of the combined EBITDA of the constituent businesses.
        This is a cash outlay paid upfront, representing the organizational cost of true integration.
      </P>

      <SubHeading>EBITDA Thresholds by Mode</SubHeading>
      <P>
        Each recipe has a base EBITDA threshold that the constituent businesses must collectively meet.
        This threshold is scaled by your game mode:
      </P>
      <DataTable
        headers={['Mode', 'Threshold Multiplier']}
        rows={[
          ['Easy / Full Game', '1.0x (full threshold)'],
          ['Easy / Quick Play', '0.7x'],
          ['Normal / Full Game', '0.7x'],
          ['Normal / Quick Play', '0.5x (lowest threshold)'],
        ]}
      />

      <SubHeading>Adding Businesses Post-Forge</SubHeading>
      <P>
        After forging a platform, you can add new acquisitions to it. Any active business with a
        matching sector and sub-type that isn&apos;t already in another platform can be integrated.
        The new member receives the same one-time margin and growth bonuses, and the integration
        cost is the recipe&apos;s fraction applied to that business&apos;s EBITDA.
      </P>

      <SubHeading>Merging Platform Members</SubHeading>
      <P>
        Merging two businesses that belong to a platform preserves the platform membership.
        The merged company inherits the platform affiliation and replaces the old constituents in
        the platform. If the merge reduces sub-type diversity below the recipe&apos;s minimum, the
        platform dissolves.
      </P>

      <HighlightBox variant="tip">
        <strong>Strategy:</strong> Plan your platform recipe early. Look at the sub-types of
        businesses available in your deal pipeline and work toward assembling a qualifying
        combination. The margin and growth boosts are permanent, making platforms the strongest
        value driver in the game. You can always add more businesses after forging.
      </HighlightBox>
    </>
  );
}

function TurnaroundsContent() {
  return (
    <>
      <SectionTitle>Turnaround Programs</SectionTitle>
      <P>
        Turnaround programs let you improve the quality rating of low-performing businesses.
        They require unlocking capability tiers, then assigning specific programs to eligible
        businesses.
      </P>

      <SubHeading>Where to Find Turnarounds</SubHeading>
      <P>
        Turnaround features are split across three locations:
      </P>
      <BulletList items={[
        <><strong>Tier unlock &amp; upgrade:</strong> Head to the <strong>Shared Services tab</strong> — Turnaround Operations sits alongside M&amp;A Infrastructure as an amber-themed card.</>,
        <><strong>Start a turnaround:</strong> Open a business card in the <strong>Portfolio tab</strong> and click the <strong>&ldquo;Turnaround&rdquo; button</strong> (visible when the business is eligible).</>,
        <><strong>Monitor active turnarounds:</strong> Progress badges appear on each business card, and a collapsible <strong>summary card at the top of the Portfolio tab</strong> shows all active turnarounds at a glance.</>,
      ]} />

      <SubHeading>Turnaround Tiers</SubHeading>
      <DataTable
        headers={['Tier', 'Name', 'Unlock Cost', 'Annual Cost', 'Required Businesses']}
        rows={[
          ['T1', 'Portfolio Operations', '$600K', '$250K/yr', '2+'],
          ['T2', 'Transformation Office', '$1M', '$450K/yr', '3+'],
          ['T3', 'Interim Management', '$1.4M', '$700K/yr', '4+'],
        ]}
      />
      <P>
        Each tier also provides an increasing bonus to the chance of quality improvement
        when applying operational improvements (T1: +15ppt, T2: +20ppt, T3: +25ppt, on top of
        the base 30%).
      </P>

      <SubHeading>Programs</SubHeading>
      <DataTable
        headers={['Program', 'Tier', 'From', 'To', 'Duration (Std/Quick)', 'Success', 'Partial', 'Fail']}
        rows={[
          ['Operational Cleanup', '1', 'Q1', 'Q2', '4yr / 2yr', '65%', '30%', '5%'],
          ['Performance Acceleration', '1', 'Q2', 'Q3', '4yr / 2yr', '60%', '35%', '5%'],
          ['Full Restructuring', '2', 'Q1', 'Q3', '5yr / 3yr', '68%', '24%', '8%'],
          ['Strategic Repositioning', '2', 'Q2', 'Q4', '5yr / 3yr', '65%', '25%', '10%'],
          ['Enterprise Turnaround', '3', 'Q1', 'Q4', '6yr / 3yr', '73%', '15%', '12%'],
          ['Total Transformation', '3', 'Q2', 'Q5', '6yr / 3yr', '70%', '20%', '10%'],
          ['100-Day Blitz', '3', 'Q1', 'Q4', '3yr / 2yr', '63%', '22%', '15%'],
        ]}
      />
      <P>
        On <strong>success</strong>, the business reaches the target quality and gets an
        EBITDA boost (7-15%). On <strong>partial success</strong>, quality improves by 1 tier
        (instead of the full target) with a smaller boost. On <strong>failure</strong>, quality
        stays the same and EBITDA takes a hit (3-6%).
      </P>

      <SubHeading>Costs</SubHeading>
      <P>
        Each program charges an upfront cost (10-27% of the business&apos;s EBITDA) plus an annual
        cost ($50K-$200K/yr) for the duration.
      </P>

      <SubHeading>Portfolio Fatigue</SubHeading>
      <HighlightBox variant="warning">
        Running <strong>4 or more simultaneous turnarounds</strong> triggers portfolio fatigue,
        applying a <strong>-10 percentage point</strong> penalty to all turnaround success rates.
        Stagger your turnarounds for best results.
      </HighlightBox>

      <SubHeading>Exit Premium</SubHeading>
      <P>
        Businesses that have improved by <strong>2 or more quality tiers</strong> (cumulative
        across all turnarounds and improvements) receive a <strong>+0.25x exit multiple
        premium</strong> at sale time, rewarding your transformation effort.
      </P>

      <SubHeading>Quality Ceilings by Sector</SubHeading>
      <P>
        Some sectors have structural limits on quality. Regulatory constraints, talent
        concentration, and industry dynamics mean not every business can reach Q5:
      </P>
      <DataTable
        headers={['Max Quality', 'Sectors']}
        rows={[
          ['Q3', 'Agency, Restaurant'],
          ['Q4', 'SaaS, Industrial, Healthcare, Wealth Management'],
          ['Q5', 'All other sectors (default)'],
        ]}
      />
      <P>
        Quality ceilings apply to turnaround programs and operational improvements alike.
        Programs targeting a quality level above the sector ceiling will not be available.
      </P>
    </>
  );
}

function SharedServicesContent() {
  return (
    <>
      <SectionTitle>Shared Services</SectionTitle>
      <P>
        The Shared Services tab is your central hub for portfolio-wide infrastructure. It houses
        three categories: <strong>operational shared services</strong> (below), <strong>M&amp;A
        Infrastructure</strong> (deal sourcing tiers), and <strong>Turnaround Operations</strong> (turnaround
        tier unlock and upgrade — see the Turnaround Programs section for details).
      </P>
      <P>
        Operational shared services centralize functions across your portfolio. They require a minimum of
        <strong> 3 businesses</strong> to unlock, and you can have a maximum of <strong>3
        active</strong> at any time.
      </P>

      <DataTable
        headers={['Service', 'Unlock Cost', 'Annual Cost', 'Key Effect']}
        rows={[
          ['Finance & Reporting', '$660K', '$295K/yr', 'Cash conversion +5%; margin erosion slowed ~0.1 ppt/yr'],
          ['Recruiting & HR', '$885K', '$378K/yr', 'Talent loss 50% less likely; talent gain 30% more likely; margin erosion slowed ~0.15 ppt/yr'],
          ['Procurement', '$710K', '$224K/yr', 'CapEx reduced by 15%; margin erosion slowed ~0.25 ppt/yr'],
          ['Marketing & Brand', '$800K', '$295K/yr', 'Growth rate +1.5% (+2.5% for agency/consumer)'],
          ['Technology & Systems', '$1,060K', '$450K/yr', 'Growth +0.5%, margin erosion slowed ~0.2 ppt/yr'],
        ]}
      />

      <SubHeading>Scale Benefits</SubHeading>
      <P>
        Shared service benefits scale with your portfolio size. The more businesses you operate,
        the more value you extract from centralized functions:
      </P>
      <BulletList items={[
        '1-2 businesses: 1.0x benefit (base)',
        '3-5 businesses: Gradually increasing (1.0x to 1.15x)',
        '6+ businesses: 1.2x benefit (maximum scale)',
      ]} />

      <SubHeading>M&A Sourcing Capability</SubHeading>
      <P>
        Separate from operational shared services, M&amp;A Sourcing is a dedicated deal-finding
        capability with 3 tiers:
      </P>
      <DataTable
        headers={['Tier', 'Name', 'Upgrade Cost', 'Annual Cost', 'Min Businesses', 'Key Benefits']}
        rows={[
          ['1', 'Deal Sourcing Team', '$800K', '$350K/yr', '2+', '+2 focus-sector deals, Source Deals costs $300K (was $500K), acquisition capacity: 3/year'],
          ['2', 'Industry Specialists', '$1.2M', '$550K/yr', '3+', 'Sub-type targeting, quality floor of 2, sourced deals get -1 heat tier (less competition), acquisition capacity: 4/year'],
          ['3', 'Proprietary Network', '$1.5M', '$800K/yr', '4+', '2 off-market deals (15% discount), quality floor of 3, Proactive Outreach ($400K for 2 targeted deals), acquisition capacity: 4/year'],
        ]}
      />
      <P>
        Without M&amp;A Sourcing, you can attempt 2 acquisitions per year.
      </P>
    </>
  );
}

function SellingContent() {
  return (
    <>
      <SectionTitle>Selling &amp; Exit Valuation</SectionTitle>

      <SubHeading>Exit Multiple Formula</SubHeading>
      <P>
        When you sell a business (or at game end for portfolio valuation), the exit multiple
        is calculated by stacking premiums and penalties on top of the acquisition multiple:
      </P>
      <BulletList items={[
        <><strong>Base Multiple:</strong> The acquisition multiple you originally paid</>,
        <><strong>Growth Premium:</strong> Based on EBITDA growth since acquisition (up to +2.5x for exceptional growth, down to -1.0x for decline)</>,
        <><strong>Quality Premium:</strong> +0.4x per quality star above 3, -0.4x per star below 3</>,
        <><strong>Hold Period Premium:</strong> +0.1x per year held, capped at +0.5x (5+ years)</>,
        <><strong>Improvements Premium:</strong> Based on operational improvements applied (capped at +1.0x total)</>,
        <><strong>Size Tier Premium:</strong> Larger EBITDA businesses attract larger buyer pools and higher multiples</>,
        <><strong>Platform Premium:</strong> Logarithmic curve based on platform scale (~+1.0x at Scale 5, continues growing for larger platforms)</>,
        <><strong>Integrated Platform Premium:</strong> +1.0 to +2.0x for businesses in forged platforms</>,
        <><strong>Turnaround Premium:</strong> +0.25x for businesses improved 2+ quality tiers</>,
        <><strong>Market Conditions:</strong> +0.5x during bull markets, -0.5x during recessions</>,
      ]} />
      <HighlightBox>
        <strong>Premium Cap:</strong> Earned premiums (growth, quality, improvements, etc.) are capped at the higher of <strong>10x + platform headroom</strong> or{' '}
        <strong>1.5× the base multiple</strong>. Platform headroom scales with platform scale (+0.3x per level),
        so larger platforms have more room for premium stacking. The integrated platform premium is structural and added on top of this cap,
        so forging a platform always provides its full multiple expansion benefit.
      </HighlightBox>
      <HighlightBox>
        <strong>Multiple Floor:</strong> The exit multiple can never drop below <strong>2.0x</strong>,
        ensuring even struggling businesses retain some value.
      </HighlightBox>

      <SubHeading>Unsolicited Offers</SubHeading>
      <P>
        Occasionally, buyers will approach you with an unsolicited offer for one of your businesses.
        These offers typically carry a 20-50% premium above fair market value. Buyer types include
        strategic acquirers, PE firms, and family offices. You can accept (instant sale) or decline
        (keep the business).
      </P>

      <SubHeading>Net Proceeds</SubHeading>
      <P>
        When you sell a business, the net proceeds are calculated as:
      </P>
      <HighlightBox>
        Net Proceeds = Exit Price - Outstanding Debt - Outstanding Earn-outs
        <br />
        Your Share = Net Proceeds &times; (1 - Seller Rollover %)
      </HighlightBox>
      <P>
        If the business was acquired with rollover equity, the seller receives their rollover percentage
        of net proceeds at exit. This applies to all exit paths including direct sales, unsolicited offers,
        and distressed sales.
      </P>

    </>
  );
}

function EventsContent() {
  return (
    <>
      <SectionTitle>Events</SectionTitle>
      <P>
        Each year, one event occurs that can shape your strategy. Events are randomly selected
        and can be global (economy-wide) or portfolio-specific.
      </P>

      <SubHeading>Global Events</SubHeading>
      <DataTable
        headers={['Event', 'Effect']}
        rows={[
          ['Bull Market', 'EBITDA boost across portfolio; +0.5x exit multiples'],
          ['Recession', 'Revenue and EBITDA decline (scaled by sector sensitivity); -0.5x exit multiples. 1-2 discounted deals appear at 15-25% off (quality capped at 3).'],
          ['Interest Rate Hike', 'Base rate increases +0.5%; debt becomes more expensive'],
          ['Interest Rate Cut', 'Base rate decreases -0.5%; debt becomes cheaper'],
          ['Inflation', 'Margin compression across portfolio; costs rise faster than revenue'],
          ['Credit Tightening', 'Bank debt unavailable for several rounds; LBO structures blocked; deal heat reduced by 1 tier (fewer competing buyers)'],
          ['Financial Crisis', 'Exit multiples -1.0x. Interest rate +2%. Existing bank debt rates +1.5%. Credit tightening for 2 rounds. 3-4 distressed deals appear at 30-50% off. ~2% probability — devastating for leveraged players, but a gift for cash-rich allocators.'],
          ['Quiet Year', 'Nothing significant happens; a chance to execute your plan undisturbed'],
        ]}
      />

      <SubHeading>Recession Sensitivity by Sector</SubHeading>
      <P>
        Not all sectors are hit equally by recessions. The recession sensitivity multiplier
        determines how much a recession affects each sector:
      </P>
      <DataTable
        headers={['Sensitivity', 'Sectors']}
        rows={[
          ['Very Low (0.2-0.3)', 'Healthcare (0.2), Home Services (0.3), Auto Services (0.25), Environmental (0.3)'],
          ['Low (0.35-0.5)', 'Insurance (0.35), Wealth Mgmt (0.4), SaaS (0.5)'],
          ['Medium (0.6-0.8)', 'Real Estate (0.6), Distribution (0.65), Industrial (0.7), B2B Services (0.8), Restaurants (0.8)'],
          ['High (1.0-1.2)', 'Consumer Brands (1.0), Agency (1.2)'],
          ['Counter-Cyclical (-0.2)', 'Education (-0.2) — actually benefits from recessions'],
        ]}
      />

      <SubHeading>Portfolio Events</SubHeading>
      <DataTable
        headers={['Event', 'Effect']}
        rows={[
          ['Star Talent Joins', 'EBITDA and growth boost for one business'],
          ['Key Talent Leaves', 'EBITDA decline for one business; may hurt integration'],
          ['Major Client Signs', 'Revenue and EBITDA increase for one business'],
          ['Client Churns', 'Revenue and EBITDA decline for one business'],
          ['Breakthrough', 'Significant positive impact — new product, market expansion, etc.'],
          ['Compliance Issue', 'Cash cost and potential EBITDA impact for one business'],
          ['Unsolicited Offer', 'A buyer offers a premium for one of your businesses (accept/decline)'],
          ['Management Buyout', 'CEO offers 85-90% of fair value; accept to sell, decline risks CEO departure (quality -1)'],
          ['Equity Demand', 'A key employee demands equity; grant or risk losing them'],
          ['Seller Note Renegotiation', 'A seller asks to renegotiate their note terms'],
          ['Seller Deception Discovered', 'Revenue drops 25%, quality -1 on a recently acquired business. Choose how to respond.'],
          ['Working Capital Crunch', 'A newly acquired business needs $200-600K in working capital. Inject cash or accept revenue penalty.'],
        ]}
      />

      <SubHeading>Choice-Based Events</SubHeading>
      <P>
        Some events present you with a strategic choice. Each option has different costs,
        risks, and outcomes — there&apos;s no universally &quot;right&quot; answer.
      </P>

      <DataTable
        headers={['Event', 'Trigger', 'Choices']}
        rows={[
          ['Key-Man Risk', 'Quality 4+ business, no active turnaround', 'Golden Handcuffs (15% EBITDA, 55% restore chance) · Succession Plan ($200-400K, restores quality after 2 years) · Accept Hit (free, quality stays dropped)'],
          ['Earn-Out Dispute', 'Business with earn-out that has underperformed', 'Settle (pay 50%, obligation cleared) · Fight (70% win, 30% pay full + legal) · Renegotiate (reduce to 55%, no cash cost)'],
          ['Supplier Pricing Power Shift', 'Below-median-margin business', 'Absorb (recover 2 of 3ppt) · Switch Suppliers (full recovery, -5% revenue) · Vertical Integration (full +1ppt bonus, requires 2+ same-sector businesses)'],
          ['Consolidation Boom', '3% random, targets specific sector (or any sector with 3+ businesses)', 'No choice — all deals in the booming sector cost 20% more. Own 2+ businesses in that sector? You get an exclusive tuck-in at normal price.'],
          ['Seller Deception', 'Business acquired within 2 rounds (non-cash structure)', 'Invest in Turnaround (20% EBITDA, 65% restore chance) · Fire Sale (sell at 60% fair value) · Absorb Hit (free, stays dropped)'],
          ['Working Capital Crunch', 'Business acquired in the previous round', 'Inject Cash (full cost, no penalty) · Emergency Credit ($50% cost, +1% interest) · Absorb Hit (-10% revenue for 2 rounds)'],
          ['Management Succession', '20yr mode, business held 8+ years, Q3+', 'Invest in External Hire ($300-500K, 75% restore) · Promote from Within (free, 50%+ restore) · Sell Business (85% fair value)'],
        ]}
      />
    </>
  );
}

function ScoringContent() {
  return (
    <>
      <SectionTitle>Scoring &amp; Leaderboard</SectionTitle>

      <SubHeading>Score Breakdown (100 Points Total)</SubHeading>
      <DataTable
        headers={['Category', 'Max Points', 'What It Measures']}
        rows={[
          ['Value Creation', '20', 'FEV as a multiple of initial raise (target: 10x for 20yr, 5x for 10yr)'],
          ['FCF/Share Growth', '20', 'How much free cash flow per share grew over the game (target: 4x for 20yr, 2x for 10yr)'],
          ['Portfolio ROIC', '15', 'Return on invested capital — are you earning above your cost of capital? (target: 25%+ for 20yr, 20%+ for 10yr)'],
          ['Capital Deployment', '15', 'Average MOIC across investments (net of business debt) + Return on Incremental Invested Capital (ROIIC)'],
          ['Balance Sheet Health', '15', 'Ending leverage ratio with steep penalties above 3.5x, plus penalties for over-leveraging, covenant breaches, and restructuring'],
          ['Strategic Discipline', '15', 'Sector focus, shared services usage, capital return discipline, deal quality'],
        ]}
      />

      <SubHeading>Grade Scale</SubHeading>
      <DataTable
        headers={['Grade', 'Score Range', 'Title']}
        rows={[
          ['S', '90-100', 'Master Allocator'],
          ['A', '75-89', 'Skilled Compounder'],
          ['B', '60-74', 'Solid Builder'],
          ['C', '40-59', 'Emerging Operator'],
          ['D', '20-39', 'Apprentice'],
          ['F', '0-19', 'Blown Up (or Bankrupt)'],
        ]}
      />

      <SubHeading>Founder Equity Value (FEV)</SubHeading>
      <P>
        FEV is the <strong>primary leaderboard metric</strong>. It represents the value of your
        personal stake in the holdco:
      </P>
      <HighlightBox>
        FEV = Enterprise Value x Founder Ownership %
      </HighlightBox>
      <P>
        Enterprise Value = (Portfolio EBITDA x Blended Exit Multiple) + Cash - Total Debt
      </P>

      <SubHeading>Leaderboard Tabs</SubHeading>
      <BulletList items={[
        <><strong>Overall:</strong> All runs ranked by Adjusted FEV (raw FEV x difficulty multiplier x restructuring penalty if applicable)</>,
        <><strong>Hard / 20yr:</strong> Normal difficulty, full game only — ranked by raw FEV</>,
        <><strong>Hard / 10yr:</strong> Normal difficulty, quick play only — ranked by raw FEV</>,
        <><strong>Easy / 20yr:</strong> Easy difficulty, full game only — ranked by raw FEV</>,
        <><strong>Easy / 10yr:</strong> Easy difficulty, quick play only — ranked by raw FEV</>,
        <><strong>Distributions:</strong> Ranked by founder personal wealth (total distributions received)</>,
      ]} />

      <SubHeading>Difficulty Multiplier</SubHeading>
      <P>
        On the Overall leaderboard, Normal mode runs receive a <strong>1.35x multiplier</strong> to
        their FEV, compensating for the harder starting position ($5M vs $20M, debt from day one,
        100% ownership). Easy mode receives a <strong>0.9x multiplier</strong> reflecting
        the capital advantage. Games that required restructuring receive a <strong>0.80x penalty</strong> (20%
        haircut). Within mode-specific tabs, raw FEV is used for fair comparison.
      </P>
    </>
  );
}

function SectorsContent() {
  return (
    <>
      <SectionTitle>The 15 Sectors</SectionTitle>
      <P>
        Each sector has unique economics that affect acquisition multiples, growth rates, margins,
        CapEx requirements, and recession vulnerability. Understanding sector characteristics is
        key to building a resilient portfolio.
      </P>

      <DataTable
        headers={['Sector', 'EBITDA Range', 'Multiple Range', 'Recession', 'Key Trait']}
        rows={[
          ['Marketing & Advertising', '$800K-$3M', '2.5-5.0x', 'High (1.2)', 'Talent-dependent, high margins but volatile; great shared services benefit'],
          ['Software & SaaS', '$1.2M-$4.5M', '4.5-8.0x', 'Low (0.5)', 'Recurring revenue, high growth, high CapEx; best recession resilience'],
          ['Home Services', '$1M-$4M', '2.5-5.5x', 'Very Low (0.3)', 'Recession-proof essential services; strong roll-up candidate'],
          ['Consumer Brands', '$900K-$3.5M', '3.5-6.5x', 'High (1.0)', 'Brand-driven; volatile margins with high CapEx'],
          ['Industrial', '$1.5M-$6M', '4.0-7.0x', 'Medium (0.7)', 'Capital-intensive but stable; largest EBITDA businesses'],
          ['B2B Services', '$1M-$3.8M', '3.0-6.0x', 'Medium (0.8)', 'Diverse sub-sectors; moderate across all dimensions'],
          ['Healthcare', '$1.2M-$5M', '4.0-7.5x', 'Very Low (0.2)', 'Most recession-resistant; high multiples, talent-dependent'],
          ['Restaurants', '$900K-$3.5M', '3.0-5.5x', 'Medium (0.8)', 'Tightest margins (8-18%); steepest margin drift'],
          ['Real Estate', '$2M-$8M', '5.0-9.0x', 'Low (0.6)', 'Highest CapEx (18%); highest margins (35-65%); highest multiples tier'],
          ['Education', '$800K-$3.2M', '3.0-5.5x', 'Counter-Cyclical (-0.2)', 'Only sector that benefits from recessions; low CapEx'],
          ['Insurance', '$1M-$4.2M', '6.0-10.0x', 'Low (0.35)', 'Highest multiples; very sticky, recurring revenue'],
          ['Auto Services', '$900K-$3.8M', '3.0-5.5x', 'Very Low (0.25)', 'Essential services with low recession risk; strong roll-up sector'],
          ['Distribution', '$1.2M-$5M', '3.5-6.5x', 'Medium (0.65)', 'Thin margins (10-18%); highest shared services benefit (1.5x)'],
          ['Wealth Management', '$1M-$4.5M', '7.0-12.0x', 'Low (0.4)', 'Highest multiples in the game; AUM-driven, recurring fees'],
          ['Environmental', '$1.2M-$5M', '4.0-7.0x', 'Very Low (0.3)', 'Essential, regulated; high CapEx but very stable cash flows'],
        ]}
      />

      <HighlightBox variant="tip">
        <strong>Sector Selection Strategy:</strong> High-multiple sectors (Insurance, Wealth
        Management, SaaS) are expensive to enter but compound well. Low-multiple sectors
        (Agency, Home Services, Auto) are cheap but need operational excellence and scale
        to create value. Recession-resistant sectors (Healthcare, Home Services, Environmental)
        provide stability in downturns.
      </HighlightBox>
    </>
  );
}

function StrategyContent() {
  return (
    <>
      <SectionTitle>Tips &amp; Strategy</SectionTitle>

      <SubHeading>Capital Management</SubHeading>
      <BulletList items={[
        <><strong>Don&apos;t over-leverage.</strong> Stay under 3.5x Net Debt/EBITDA for safety. Once you hit 4.5x, you&apos;re in breach with severe restrictions. Two years of breach = bankruptcy. After restructuring, breach years are cumulative (non-consecutive counts) and insolvency (wiped-out equity) triggers automatic game over.</>,
        <><strong>Quality matters more than price.</strong> A quality-4 business at 6x is often better than a quality-2 at 3x. Higher quality means better growth, stronger margins, easier integration, and higher exit multiples.</>,
        <><strong>Watch margin drift.</strong> Most sectors slowly compress margins over time. Without active intervention (shared services, improvements), your cash flows will erode. Restaurants and agencies drift the fastest.</>,
      ]} />

      <SubHeading>Portfolio Construction</SubHeading>
      <BulletList items={[
        <><strong>Shared services pay off at 3+ businesses.</strong> Finance &amp; Reporting and Procurement are usually the first two to unlock. Wait until you have 3 opcos before investing.</>,
        <><strong>Stagger acquisitions.</strong> Avoid buying too many businesses at once. Integration takes 1-3 years, and multiple simultaneous integrations strain management attention.</>,
        <><strong>Diversify across 2-3 sectors for resilience.</strong> A single-sector portfolio can be devastated by one bad recession. Spreading across recession-resistant and growth sectors balances risk and return.</>,
      ]} />

      <SubHeading>Platform Strategy</SubHeading>
      <BulletList items={[
        <><strong>Plan the recipe early.</strong> Check which platform recipes match the businesses in your pipeline. Working toward a specific combination is far more effective than hoping one materializes.</>,
        <><strong>Platforms are powerful but expensive.</strong> The 18-25% integration cost is a significant cash outlay. Make sure you can afford it without over-leveraging.</>,
        <><strong>Integrated platforms compound value.</strong> The one-time margin boost and growth boost are permanent mutations. Over a long game, these compound significantly.</>,
      ]} />

      <SubHeading>Turnarounds &amp; Quality</SubHeading>
      <BulletList items={[
        <><strong>Turnarounds are high-risk, high-reward.</strong> A successful Q1→Q4 turnaround transforms a struggling business into a strong performer. But a failure wastes years and money.</>,
        <><strong>Never run 4+ turnarounds simultaneously.</strong> The -10ppt fatigue penalty significantly reduces your odds. Stagger them across rounds.</>,
        <><strong>Target the exit premium.</strong> Improving a business by 2+ quality tiers earns +0.25x on exit. Buy Q1-Q2 businesses cheaply, improve them, and sell at a premium.</>,
      ]} />

      <SubHeading>Timing &amp; Exit</SubHeading>
      <BulletList items={[
        <><strong>Hold period premium rewards patience.</strong> Holding a business 5+ years adds +0.5x to the exit multiple. Don&apos;t flip businesses too quickly unless the offer is exceptional.</>,
        <><strong>Sell during bull markets.</strong> The +0.5x market conditions bonus during bull markets can be the difference between a good exit and a great one.</>,
        <><strong>Accept unsolicited offers carefully.</strong> 20-50% premiums are tempting, but selling your best business might hurt more than the premium helps. Sell underperformers to these buyers, not your crown jewels.</>,
        <><strong>Sell underperformers.</strong> A business with collapsed EBITDA that you can&apos;t turn around is a drag on your portfolio. Sell it and redeploy the capital into better opportunities.</>,
      ]} />

      <HighlightBox variant="tip">
        <strong>The Master Allocator&apos;s Playbook:</strong> Buy quality businesses at fair prices.
        Integrate them into platforms for structural advantages. Invest in shared services to
        defend margins and boost growth. Maintain conservative leverage. Return capital when
        reinvestment opportunities dry up. Play the long game.
      </HighlightBox>
    </>
  );
}

function GlossaryContent() {
  return (
    <>
      <SectionTitle>Glossary</SectionTitle>
      <div className="space-y-3 text-sm text-gray-300">
        <div>
          <strong className="text-white">EBITDA</strong> &mdash; Earnings Before Interest, Taxes,
          Depreciation, and Amortization. The primary measure of a business&apos;s operating profit.
          In this game, all EBITDA values are displayed as dollar amounts (e.g., $1.5M).
        </div>
        <div>
          <strong className="text-white">EV (Enterprise Value)</strong> &mdash; The total value of
          the holdco: (Portfolio EBITDA x Blended Multiple) + Cash - Debt. Represents what the
          company is worth to an acquirer.
        </div>
        <div>
          <strong className="text-white">FEV (Founder Equity Value)</strong> &mdash; Enterprise
          Value multiplied by your ownership percentage. The primary leaderboard metric. Reflects
          the value of YOUR stake, not the whole company.
        </div>
        <div>
          <strong className="text-white">MOIC (Multiple on Invested Capital)</strong> &mdash;
          Total value returned (net of business-level debt) divided by total capital invested. A 2.5x MOIC means you got
          $2.50 back for every $1.00 invested. Leverage reduces MOIC because outstanding debt is deducted from business value.
        </div>
        <div>
          <strong className="text-white">ROIC (Return on Invested Capital)</strong> &mdash;
          Annual return generated on the capital deployed in the business. Target 15-25% for
          strong performance.
        </div>
        <div>
          <strong className="text-white">ROIIC (Return on Incremental Invested Capital)</strong> &mdash;
          The return earned specifically on new capital deployed during the year. Measures whether
          each new dollar you invest is earning its keep.
        </div>
        <div>
          <strong className="text-white">FCF (Free Cash Flow)</strong> &mdash; Cash generated
          after all operating expenses, CapEx, debt service, and taxes. This is the cash available
          for acquisitions, debt repayment, buybacks, or distributions.
        </div>
        <div>
          <strong className="text-white">CapEx (Capital Expenditures)</strong> &mdash; Ongoing
          investment required to maintain and grow a business. Expressed as a percentage of
          EBITDA. Ranges from 3% (agencies) to 18% (real estate).
        </div>
        <div>
          <strong className="text-white">Net Debt</strong> &mdash; Total debt minus cash on hand.
          Net Debt / EBITDA is the primary leverage metric that determines your covenant status.
        </div>
        <div>
          <strong className="text-white">Leverage</strong> &mdash; The ratio of debt to earnings
          (Net Debt / EBITDA). Below 2.5x is comfortable. Above 4.5x is covenant breach.
        </div>
        <div>
          <strong className="text-white">Multiple</strong> &mdash; The valuation ratio of price
          to EBITDA. A 5.0x multiple means the business is valued at 5 times its annual EBITDA.
          Higher multiples indicate higher perceived quality, growth, or market demand.
        </div>
        <div>
          <strong className="text-white">Tuck-in (Bolt-on)</strong> &mdash; A small acquisition
          integrated into an existing platform business. Tuck-ins receive a quality-dependent
          price discount (5-25%) and add scale to the platform.
        </div>
        <div>
          <strong className="text-white">Platform</strong> &mdash; A business designated to
          receive bolt-on acquisitions. Integrated platforms are forged from multiple businesses
          with matching sub-types for powerful bonuses.
        </div>
        <div>
          <strong className="text-white">Earn-out</strong> &mdash; A deal structure where part
          of the purchase price is contingent on the business hitting EBITDA growth targets.
          You pay upfront (55%) and owe the rest only if targets are met within a 4-year window.
          Unpaid earn-outs expire after 4 years.
        </div>
        <div>
          <strong className="text-white">Seller Note</strong> &mdash; Financing provided by the
          seller of a business. Typically 5-6% interest rate, amortizing over 5 years in equal
          annual installments. Less risky than bank debt because the seller is aligned with your success.
        </div>
        <div>
          <strong className="text-white">Covenant</strong> &mdash; A financial condition you must
          maintain as part of your debt agreements. In this game, the key covenant is your
          leverage ratio (Net Debt / EBITDA). Breaching covenants triggers severe restrictions.
        </div>
        <div>
          <strong className="text-white">LBO (Leveraged Buyout)</strong> &mdash; An acquisition
          structure using maximum leverage: 25% cash equity + 35% seller note + 40% bank debt.
          High risk, high potential return if the business performs well.
        </div>
        <div>
          <strong className="text-white">Rollover Equity</strong> &mdash; A deal structure where
          the seller reinvests ~25% (standard) or ~20% (quick) of their proceeds as equity in the acquired business. Reduces
          your cash outlay and keeps the seller aligned. Seller note at 5%. At exit, the seller receives their
          rollover percentage of net proceeds. Requires M&amp;A Sourcing Tier 2+, Quality 3+, and no financial stress.
        </div>
        <div>
          <strong className="text-white">Rule of 40</strong> &mdash; A SaaS/tech metric where
          Revenue Growth % + EBITDA Margin % should sum to at least 40. Businesses exceeding
          this threshold earn a valuation premium.
        </div>
      </div>
    </>
  );
}

function TwentyYearContent() {
  return (
    <>
      <SectionTitle>20-Year Mode (Full Game)</SectionTitle>
      <P>
        The Full Game (20-year) mode includes additional mechanics that create a richer
        late-game experience. These features are exclusive to 20-year mode &mdash; Quick Play
        (10-year) games are unaffected.
      </P>

      <SubHeading>Late-Game Deal Inflation</SubHeading>
      <P>
        Starting in year 11, asking multiples on new deals inflate by +0.5x per year,
        capping at +3.0x above normal prices. This reflects market maturation and increased
        competition for quality assets as your holdco grows.
      </P>
      <BulletList items={[
        <>Year 11: +0.5x, Year 12: +1.0x, ... Year 16+: +3.0x (cap)</>,
        <>A Financial Crisis resets inflation by -2.0x for 2 rounds, creating a window for bargain hunting</>,
        <>Inflation applies after quality adjustment but before competitive positioning</>,
      ]} />

      <SubHeading>Management Succession Events</SubHeading>
      <P>
        Businesses held 8+ years with Q3+ quality may face an operator retirement event.
        The founding manager is ready to step down &mdash; how you handle the transition
        determines the business&apos;s future.
      </P>
      <DataTable
        headers={['Choice', 'Cost', 'Success Rate', 'Outcome']}
        rows={[
          ['Invest in External Hire', '$300-500K', '75%', 'Quality restored if successful'],
          ['Promote from Within', 'Free', '50% base', 'Quality restored; HR shared service +20%, platform +15% bonus (cap 95%)'],
          ['Sell the Business', 'None', 'Guaranteed', 'Business sold at 85% of fair value'],
        ]}
      />
      <P>
        Quality drops by 1 tier immediately when the event fires. Each business can only
        face this event once (it cannot repeat for the same business).
      </P>
      <HighlightBox variant="tip">
        <strong>Tip:</strong> If you have Recruiting &amp; HR active, the promote path jumps
        to 70% success rate for free &mdash; a strong option for cash-strapped operators.
      </HighlightBox>

      <SubHeading>IPO Pathway</SubHeading>
      <P>
        At round 16+, qualifying holdcos can take the company public. The IPO section
        appears in the <strong>Capital tab</strong> during the Allocate phase. Going public opens
        new capabilities but introduces Wall Street constraints.
      </P>
      <DataTable
        headers={['Gate', 'Requirement']}
        rows={[
          ['Minimum EBITDA', '$75M+ portfolio EBITDA'],
          ['Businesses', '6+ active businesses'],
          ['Avg Quality', '4.0+ average quality rating'],
          ['Platforms', '2+ forged platforms'],
          ['Round', 'Year 16+'],
        ]}
      />

      <P><strong>Post-IPO mechanics:</strong></P>
      <BulletList items={[
        <><strong>Stock price</strong> is derived from enterprise value: (Equity Value / Total Shares) &times; (1 + Market Sentiment)</>,
        <><strong>Earnings expectations</strong> are set at prior EBITDA &times; 1.05 &mdash; analysts expect 5% growth every year</>,
        <><strong>Beat earnings:</strong> +8% market sentiment. <strong>Miss earnings:</strong> -15% sentiment</>,
        <><strong>2 consecutive misses:</strong> analyst downgrade (-10% additional sentiment)</>,
        <><strong>Share-funded acquisitions:</strong> max 1 per round, each causes -5% FEV dilution penalty</>,
      ]} />

      <SubHeading>Stay Private Bonus</SubHeading>
      <P>
        Not every holdco should go public. If you meet IPO eligibility requirements but
        choose to stay private, you earn a <strong>+5-10% FEV bonus</strong> at game end.
        The bonus scales with how far above the EBITDA gate you are. This makes the
        private path a viable strategic choice.
      </P>

      <SubHeading>Family Office Endgame</SubHeading>
      <P>
        The Family Office is a post-game 5-round mini-game unlocked after the main game
        ends for exceptional players. It explores what happens after the fortune is made:
        wealth preservation, philanthropy, and generational succession.
      </P>
      <DataTable
        headers={['Gate', 'Requirement']}
        rows={[
          ['Distributions', '$1B+ in founder distributions received'],
          ['Composite Grade', 'B or better'],
          ['Quality Portfolio', '3+ businesses at Q4+ quality'],
          ['Long-Held Businesses', '2+ businesses held for 10+ years'],
        ]}
      />

      <P><strong>Family Office mechanics:</strong></P>
      <BulletList items={[
        <><strong>Reputation</strong> (0-100): starts at 50 (neutral), influenced by philanthropy and decisions</>,
        <><strong>Philanthropy:</strong> irrevocable cash commitments that boost reputation and legacy score</>,
        <><strong>Investments:</strong> portfolio allocations scored on diversification</>,
        <><strong>Generational Succession</strong> (Round 3): choose Heir Apparent (risky but authentic), Professional CEO (safe but costly), or Family Council (moderate governance friction)</>,
      ]} />

      <SubHeading>Legacy Score</SubHeading>
      <P>
        At the end of the Family Office mini-game, you receive a Legacy Score (0-100)
        composed of five equally-weighted components:
      </P>
      <DataTable
        headers={['Component', 'Weight', 'What It Measures']}
        rows={[
          ['Wealth Preservation', '20%', 'Investment diversification and count'],
          ['Reputation', '20%', 'Final reputation score'],
          ['Philanthropy', '20%', 'Total committed to philanthropy'],
          ['Succession Quality', '20%', 'Governance choice and execution'],
          ['Permanent Hold Performance', '20%', 'Commitment count and depth'],
        ]}
      />
      <DataTable
        headers={['Grade', 'Score Range']}
        rows={[
          ['Enduring', '80-100'],
          ['Influential', '60-79'],
          ['Established', '40-59'],
          ['Fragile', '0-39'],
        ]}
      />

      <SubHeading>Narrative Evolution</SubHeading>
      <P>
        In 20-year mode, the AI chronicles shift voice across 5 narrative phases as your
        holdco matures:
      </P>
      <DataTable
        headers={['Phase', 'Rounds', 'Tone']}
        rows={[
          ['Scrappy Startup', '1-4', 'Hungry, uncertain, excited'],
          ['Growing Operator', '5-8', 'Confident, expanding, learning'],
          ['Seasoned Builder', '9-12', 'Commanding, strategic, measured'],
          ['Adapting Veteran', '13-16', 'Reflective, adapting, selective'],
          ['Legacy Architect', '17-20', 'Contemplative, philosophical, weighing permanence'],
        ]}
      />
      <P>
        10-year mode uses a compressed 3-phase version (Scrappy Startup rounds 1-3,
        Growing Operator rounds 4-6, Seasoned Builder rounds 7-10).
      </P>

      <SubHeading>Business Anniversaries</SubHeading>
      <P>
        At years 5, 10, and 15 of ownership, you receive a commemorative toast celebrating
        the milestone and showing how the business has grown since acquisition.
      </P>

      <SubHeading>Final Countdown</SubHeading>
      <P>
        Starting at year 18, a countdown badge appears showing how many years remain. This
        creates urgency and helps frame final allocation decisions.
      </P>
    </>
  );
}

// --- Section renderer map ---

const SECTION_CONTENT: Record<ManualSection, () => React.ReactElement> = {
  'getting-started': GettingStartedContent,
  'game-loop': GameLoopContent,
  'acquiring': AcquiringContent,
  'operations': OperationsContent,
  'financial': FinancialContent,
  'distress': DistressContent,
  'platforms': PlatformsContent,
  'turnarounds': TurnaroundsContent,
  'shared-services': SharedServicesContent,
  'selling': SellingContent,
  'events': EventsContent,
  'twenty-year': TwentyYearContent,
  'scoring': ScoringContent,
  'sectors': SectorsContent,
  'strategy': StrategyContent,
  'glossary': GlossaryContent,
};

// --- Main component ---

export function UserManualModal({ onClose }: UserManualModalProps) {
  const [activeSection, setActiveSection] = useState<ManualSection>('getting-started');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { trackFeatureUsed('manual_view', 0); }, []);

  // Filter sections by search query
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return SECTIONS;
    const q = searchQuery.toLowerCase();
    return SECTIONS.filter(s =>
      s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const ContentComponent = SECTION_CONTENT[activeSection];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      header={
        <>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <span className="text-lg">&#128214;</span> How to Play
          </h3>
          <p className="text-text-muted text-sm">Your complete guide to Holdco Tycoon</p>
        </>
      }
      size="xl"
    >
      <div className="flex flex-col lg:flex-row gap-4 -mx-1 sm:-mx-2 min-h-[50vh]">
        {/* Mobile: Toggle sidebar button */}
        <div className="lg:hidden">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 text-sm text-text-primary"
          >
            <span className="font-medium">
              {SECTIONS.find(s => s.id === activeSection)?.label ?? 'Sections'}
            </span>
            <span className="text-text-muted">{sidebarOpen ? '\u25B2' : '\u25BC'}</span>
          </button>
        </div>

        {/* Sidebar */}
        <div className={`
          lg:w-52 lg:shrink-0 lg:block
          ${sidebarOpen ? 'block' : 'hidden'}
        `}>
          {/* Search */}
          <div className="mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sections..."
              className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 min-h-[36px]"
            />
          </div>

          {/* Section list */}
          <nav className="space-y-0.5 max-h-[60vh] lg:max-h-[65vh] overflow-y-auto pr-1">
            {filteredSections.map((section, index) => (
              <button
                key={section.id}
                onClick={() => {
                  setActiveSection(section.id);
                  setSidebarOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors min-h-[36px] ${
                  activeSection === section.id
                    ? 'bg-accent text-bg-primary font-medium'
                    : 'text-text-muted hover:text-text-primary hover:bg-white/5'
                }`}
              >
                <span className="text-xs text-white/40 mr-1.5">{index + 1}.</span>
                {section.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0 overflow-y-auto max-h-[60vh] lg:max-h-[65vh] px-1 sm:px-2">
          <ContentComponent />

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t border-white/10">
            {(() => {
              const currentIdx = SECTIONS.findIndex(s => s.id === activeSection);
              const prevSection = currentIdx > 0 ? SECTIONS[currentIdx - 1] : null;
              const nextSection = currentIdx < SECTIONS.length - 1 ? SECTIONS[currentIdx + 1] : null;

              return (
                <>
                  {prevSection ? (
                    <button
                      onClick={() => setActiveSection(prevSection.id)}
                      className="text-sm text-text-muted hover:text-accent transition-colors"
                    >
                      &larr; {prevSection.label}
                    </button>
                  ) : <div />}
                  {nextSection ? (
                    <button
                      onClick={() => setActiveSection(nextSection.id)}
                      className="text-sm text-text-muted hover:text-accent transition-colors"
                    >
                      {nextSection.label} &rarr;
                    </button>
                  ) : <div />}
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </Modal>
  );
}
