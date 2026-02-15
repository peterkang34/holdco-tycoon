import { useState, useMemo } from 'react';
import { Modal } from './Modal';

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
                <td key={ci} className="py-1.5 px-2 border-b border-white/5 whitespace-nowrap">
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
          ['Leaderboard Multiplier', '1.0x', '1.15x (rewards harder start)'],
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
        You must resolve your financial distress before proceeding.
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
        'Sell or wind down underperforming businesses',
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
        rounds) and expire if not acted upon. Deals come from various sources: inbound, brokered,
        sourced, or proprietary (the rarest and best).
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
      <P>Five deal structures are available depending on the deal and your financial position:</P>
      <DataTable
        headers={['Structure', 'Equity %', 'Debt/Other %', 'Risk', 'Notes']}
        rows={[
          ['All Cash', '100%', '0%', 'Low', 'No leverage; requires full cash on hand'],
          ['Seller Note', '40%', '60% seller note', 'Medium', 'Seller financing at 5-6% interest'],
          ['Bank Debt', '35%', '65% bank debt', 'High', 'At current interest rate; not available during credit tightening'],
          ['Earn-out', '55%', '45% contingent', 'Medium', 'Contingent on EBITDA growth targets; available for Q3+ deals'],
          ['LBO', '25%', '35% note + 40% bank', 'High', 'Maximum leverage; not available during credit tightening'],
        ]}
      />

      <SubHeading>Quality Ratings</SubHeading>
      <P>
        Every business has a quality rating from 1 to 5 stars. Quality profoundly affects
        performance:
      </P>
      <BulletList items={[
        'Higher quality = better organic growth rates',
        'Higher quality = stronger margin retention',
        'Higher quality = higher exit multiples (quality premium: +0.4x per star above 3)',
        'Higher quality = smoother integration when acquired',
        'Quality 1-2 businesses are turnaround candidates',
      ]} />

      <SubHeading>Due Diligence Signals</SubHeading>
      <P>
        Each deal shows due diligence signals to help you evaluate risk:
      </P>
      <BulletList items={[
        <><strong>Revenue Concentration</strong> (low/medium/high) &mdash; high concentration means losing one client is devastating</>,
        <><strong>Operator Quality</strong> (strong/moderate/weak) &mdash; affects integration success</>,
        <><strong>Trend</strong> (growing/flat/declining) &mdash; current trajectory</>,
        <><strong>Customer Retention</strong> (0-100%) &mdash; how sticky the revenue is</>,
        <><strong>Competitive Position</strong> (leader/competitive/commoditized) &mdash; market power</>,
      ]} />

      <SubHeading>Tuck-in Acquisitions</SubHeading>
      <P>
        If you have a business designated as a platform, you can acquire compatible businesses
        as bolt-on &ldquo;tuck-ins.&rdquo; Tuck-ins receive a quality-dependent price discount (5-25%,
        lower quality = deeper discount) and integrate into the parent platform, sharing overhead
        and scaling the platform. Integration period depends on operator quality (1-3 years).
      </P>
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
        <><strong>Shared services:</strong> Procurement reduces CapEx by 15%. Marketing and Technology help defend margins.</>,
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
          ['Seller Notes', 'Deal-level', '5-6%', 'Amortizes over 4-5 years; tied to individual acquisition'],
          ['Bank Debt', 'Holdco-level', '7% base', 'Amortizes over 5-10 years; affected by events and distress penalties'],
          ['Earn-outs', 'Deal-level', 'N/A', 'Contingent payments based on EBITDA growth targets; not traditional debt'],
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
        'There is no hard cap — but successive raises become increasingly expensive',
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
        consecutive years</strong>, you are forced into bankruptcy. This ends your game
        immediately with an F grade and a score of 0.
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
      <P>
        Restructuring is a one-time lifeline. If you breach covenants again after restructuring,
        it leads to automatic game over.
      </P>

      <SubHeading>When EBITDA Goes to Zero</SubHeading>
      <P>
        If your total EBITDA drops to zero or below while you have debt, the system automatically
        treats this as a covenant breach, since the leverage ratio becomes undefined (division by zero).
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
        You can designate any active business as a &ldquo;platform&rdquo; company. This lets it receive
        tuck-in acquisitions (bolt-ons) at a quality-dependent price discount (5-25%). As tuck-ins are added, the
        platform&apos;s scale increases (1-3), which provides a small exit multiple premium
        (+0.2x per scale level).
      </P>

      <SubHeading>Integrated Platforms</SubHeading>
      <P>
        Integrated platforms are forged by combining 2 or more businesses with matching sub-types
        that fit a specific &ldquo;recipe.&rdquo; The game includes 35 platform recipes (29 within a single
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

      <HighlightBox variant="tip">
        <strong>Strategy:</strong> Plan your platform recipe early. Look at the sub-types of
        businesses available in your deal pipeline and work toward assembling a qualifying
        combination. The margin and growth boosts are permanent, making platforms the strongest
        value driver in the game.
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
          ['T1 Plan A', '1', 'Q1', 'Q2', '4yr / 2yr', '65%', '30%', '5%'],
          ['T1 Plan B', '1', 'Q2', 'Q3', '4yr / 2yr', '60%', '35%', '5%'],
          ['T2 Plan A', '2', 'Q1', 'Q3', '5yr / 3yr', '68%', '27%', '5%'],
          ['T2 Plan B', '2', 'Q2', 'Q4', '5yr / 3yr', '65%', '30%', '5%'],
          ['T3 Plan A', '3', 'Q1', 'Q4', '6yr / 3yr', '73%', '22%', '5%'],
          ['T3 Plan B', '3', 'Q2', 'Q5', '6yr / 3yr', '70%', '25%', '5%'],
          ['T3 Quick', '3', 'Q1', 'Q4', '3yr / 2yr', '63%', '32%', '5%'],
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
    </>
  );
}

function SharedServicesContent() {
  return (
    <>
      <SectionTitle>Shared Services</SectionTitle>
      <P>
        Shared services centralize functions across your portfolio. They require a minimum of
        <strong> 3 businesses</strong> to unlock, and you can have a maximum of <strong>3
        active</strong> at any time.
      </P>

      <DataTable
        headers={['Service', 'Unlock Cost', 'Annual Cost', 'Key Effect']}
        rows={[
          ['Finance & Reporting', '$560K', '$250K/yr', 'Cash conversion +5%; better visibility into opco metrics'],
          ['Recruiting & HR', '$750K', '$320K/yr', 'Talent loss 50% less likely; talent gain 30% more likely'],
          ['Procurement', '$600K', '$190K/yr', 'CapEx reduced by 15% across portfolio'],
          ['Marketing & Brand', '$675K', '$250K/yr', 'Growth rate +1.5% (+2.5% for agency/consumer)'],
          ['Technology & Systems', '$900K', '$380K/yr', 'Reinvestment efficiency +20% (+30% for SaaS/B2B)'],
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
          ['1', 'Deal Sourcing Team', '$800K', '$350K/yr', '2+', '+2 focus-sector deals, Source Deals costs $300K (was $500K)'],
          ['2', 'Industry Specialists', '$1.2M', '$550K/yr', '3+', 'Sub-type targeting, quality floor of 2'],
          ['3', 'Proprietary Network', '$1.5M', '$800K/yr', '4+', '2 off-market deals (15% discount), quality floor of 3, Proactive Outreach ($400K for 2 targeted deals)'],
        ]}
      />
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
        <><strong>Platform Premium:</strong> +0.2x per platform scale level</>,
        <><strong>Integrated Platform Premium:</strong> +1.0 to +2.0x for businesses in forged platforms</>,
        <><strong>Turnaround Premium:</strong> +0.25x for businesses improved 2+ quality tiers</>,
        <><strong>Market Conditions:</strong> +0.5x during bull markets, -0.5x during recessions</>,
      ]} />
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
        Net Proceeds = Exit Price - Outstanding Seller Notes - Outstanding Earn-outs
      </HighlightBox>

      <SubHeading>Wind Down</SubHeading>
      <P>
        If a business is unprofitable or not worth selling, you can wind it down. You receive
        no sale proceeds, but you stop the bleeding from negative cash flows and free up
        management attention.
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
          ['Recession', 'Revenue and EBITDA decline (scaled by sector sensitivity); -0.5x exit multiples'],
          ['Interest Rate Hike', 'Base rate increases +0.5%; debt becomes more expensive'],
          ['Interest Rate Cut', 'Base rate decreases -0.5%; debt becomes cheaper'],
          ['Inflation', 'Margin compression across portfolio; costs rise faster than revenue'],
          ['Credit Tightening', 'Bank debt unavailable for several rounds; LBO structures blocked'],
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
          ['Equity Demand', 'A key employee demands equity; grant or risk losing them'],
          ['Seller Note Renegotiation', 'A seller asks to renegotiate their note terms'],
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
          ['FCF/Share Growth', '20', 'How much free cash flow per share grew over the game (target: 3x for 20yr, 1.5x for 10yr)'],
          ['Portfolio ROIC', '15', 'Return on invested capital — are you earning above your cost of capital? (target: 25%+)'],
          ['Capital Deployment', '15', 'Average MOIC across investments + Return on Incremental Invested Capital (ROIIC)'],
          ['Balance Sheet Health', '15', 'Ending leverage ratio, with penalties for over-leveraging, covenant breaches, and restructuring'],
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
        <><strong>Overall:</strong> All runs ranked by Adjusted FEV (raw FEV x difficulty multiplier)</>,
        <><strong>Hard / 20yr:</strong> Normal difficulty, full game only — ranked by raw FEV</>,
        <><strong>Hard / 10yr:</strong> Normal difficulty, quick play only — ranked by raw FEV</>,
        <><strong>Easy / 20yr:</strong> Easy difficulty, full game only — ranked by raw FEV</>,
        <><strong>Easy / 10yr:</strong> Easy difficulty, quick play only — ranked by raw FEV</>,
        <><strong>Distributions:</strong> Ranked by founder personal wealth (total distributions received)</>,
      ]} />

      <SubHeading>Difficulty Multiplier</SubHeading>
      <P>
        On the Overall leaderboard, Normal mode runs receive a <strong>1.15x multiplier</strong> to
        their FEV, compensating for the harder starting position ($5M vs $20M, debt from day one,
        100% ownership). Within mode-specific tabs, raw FEV is used for fair comparison.
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
        <><strong>Don&apos;t over-leverage.</strong> Stay under 3.5x Net Debt/EBITDA for safety. Once you hit 4.5x, you&apos;re in breach with severe restrictions. Two consecutive years of breach = bankruptcy.</>,
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
        <><strong>Wind down lost causes.</strong> A business with collapsed EBITDA that you can&apos;t turnaround is a drag on your portfolio. Wind it down and redeploy the management attention.</>,
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
          Total value returned divided by total capital invested. A 2.5x MOIC means you got
          $2.50 back for every $1.00 invested.
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
          You pay upfront (55%) and owe the rest only if targets are met.
        </div>
        <div>
          <strong className="text-white">Seller Note</strong> &mdash; Financing provided by the
          seller of a business. Typically 5-6% interest rate, amortizing over 4-5 years. Less
          risky than bank debt because the seller is aligned with your success.
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
          <strong className="text-white">Rule of 40</strong> &mdash; A SaaS/tech metric where
          Revenue Growth % + EBITDA Margin % should sum to at least 40. Businesses exceeding
          this threshold earn a valuation premium.
        </div>
      </div>
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
