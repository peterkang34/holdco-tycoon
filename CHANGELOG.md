# Holdco Tycoon - Design Changelog

A living document tracking the evolution of the game design based on user feedback and iteration.

---

## Session 4 - AI Enhancement & Market Guide (2026-02-06)

### User Request - Post-Game AI Analysis
> "now do post-game AI analysis"

### Changes Made
- **AI Performance Analysis**: Personalized game review at end of 20 years
  - Overall assessment of performance based on actual gameplay data
  - Key strengths identified with specific numbers from the game
  - Areas for improvement with actionable recommendations
  - Specific lessons tied to PE/holdco principles
  - "What if" scenarios suggesting alternative paths
  - References to famous investors (Buffett, Mark Leonard, etc.)
- **Fallback Analysis**: Rule-based insights work without API key
- **Integration**: Replaces static "Lessons from the Pros" section

### Additional Features
- **Reset Game Button**: Added "Reset" button in top bar to start over
  - Confirmation modal prevents accidental resets
- **Required Holdco Name**:
  - Added asterisk to indicate required field
  - Error message when trying to submit empty name
  - Minimum 2 characters required

### Files Created
- `src/components/ui/AIAnalysisSection.tsx` - AI analysis display component

### Files Modified
- `src/services/aiGeneration.ts` - Added generateGameAnalysis and generateFallbackAnalysis
- `src/components/screens/GameOverScreen.tsx` - Integrated AI analysis, added props
- `src/components/screens/GameScreen.tsx` - Added reset button and confirmation modal
- `src/components/screens/IntroScreen.tsx` - Added holdco name validation
- `src/App.tsx` - Added additional props for GameOverScreen, reset handler

---

### Dynamic Narratives System
> Commit: `84b0cd3` — Add dynamic narratives system for immersive storytelling

### Changes Made
- **Event Narratives**: AI-generated (or fallback) immersive context for market events
  - Each event type has a pool of pre-written narrative text
  - AI can generate richer, context-aware narratives when enabled
- **Business Story Updates**: Generated at key milestones (Year 1, 5, 10, after improvements)
  - Tracks "story beats" per business (last 5 kept)
  - Considers sector, sub-type, EBITDA change, quality, platform status
- **Year Chronicles**: Annual summary of holdco progress and market conditions
  - Summarizes acquisitions, sales, improvements made that year
  - References market conditions from recent events
- **Fallback Narratives**: Pre-written pools for 9 event categories (recession, bull market, interest rate, credit tightening, sector boom/disruption, employee departure, customer loss, regulatory change)

### Files Modified
- `src/services/aiGeneration.ts` - Added generateNarrative, generateEventNarrative, generateBusinessUpdate, generateYearChronicle, fallback narrative pools
- `src/hooks/useGame.ts` - Added fetchEventNarrative, generateBusinessStories, generateYearChronicle actions; yearChronicle state
- `src/engine/types.ts` - Added StoryBeat interface, narrative field on GameEvent
- `api/ai/generate-narrative.ts` - New Vercel serverless endpoint for narrative generation

---

### Deal Sourcing Feature
> Commit: `3966713` — Add deal sourcing feature for additional deal flow

### Changes Made
- **Hire Investment Banker**: Pay $500k to source additional deal flow
  - Generates 3 new deals, heavily weighted toward M&A focus sector
  - If no focus set, generates diverse deals across sectors
  - One use per round
  - Deals marked as `sourced` source type with fresh expiration
- **UI**: Added "Source Deals" button in Allocate phase deals tab

### Files Modified
- `src/engine/businesses.ts` - Added generateSourcedDeals function
- `src/hooks/useGame.ts` - Added sourceDealFlow action, dealSourcingUsedThisRound tracking
- `src/engine/types.ts` - Added 'source_deals' to GameActionType, 'sourced' to Deal source type
- `src/components/phases/AllocatePhase.tsx` - Added Source Deals button and cost display

---

### Leverage Display Improvement
> Commit: `419c467` — Improve leverage display: show Net Cash when debt < cash

### Changes Made
- When the holdco has more cash than debt (net cash position), the leverage metric now displays "Net Cash" instead of a negative number
- More intuitive for players to understand their balance sheet health

### Files Modified
- `src/components/dashboard/Dashboard.tsx` - Updated leverage display logic

---

### Roll-Up Guide Modal
> Commit: `50b10d7` — Add Roll-Up Guide modal to explain platform mechanics

### Changes Made
- **Roll-Up Guide**: New educational modal explaining platform/tuck-in mechanics:
  - What platforms are and how to designate them
  - How tuck-in acquisitions work (same-sector bolt-ons)
  - Multiple expansion mechanics (scale 1-3 bonuses)
  - How to merge two businesses
  - Integration outcomes (success/partial/failure)
  - Synergy expectations

### Files Created
- `src/components/ui/RollUpGuideModal.tsx` - New component

### Files Modified
- `src/components/phases/AllocatePhase.tsx` - Added Roll-Up Guide button in Portfolio tab

---

### Vercel Serverless API Routes
> Commit: `790a789` — Add Vercel serverless API routes for AI features

### Changes Made
- **Server-Side AI**: Moved AI integration from client-side API key to server-side
  - `GET /api/ai/status` - Check if ANTHROPIC_API_KEY environment variable is configured
  - `POST /api/ai/generate-deal` - Generate rich deal content (backstory, motivation, quirks, red flags, opportunities)
  - `POST /api/ai/analyze-game` - Post-game personalized AI analysis with strengths, improvements, lessons, what-if scenarios
  - `POST /api/ai/generate-narrative` - Dynamic narrative generation for events, business updates, year chronicles
- **Vercel Config**: Added `vercel.json` for deployment configuration
- **Security**: API key stored as Vercel environment variable instead of localStorage

### Files Created
- `api/ai/status.ts` - AI status check endpoint
- `api/ai/generate-deal.ts` - Deal content generation endpoint
- `api/ai/analyze-game.ts` - Game analysis endpoint
- `api/ai/generate-narrative.ts` - Narrative generation endpoint
- `vercel.json` - Vercel deployment configuration

### Files Modified
- `src/services/aiGeneration.ts` - Refactored to use server API instead of direct Claude API calls
- `package.json` - Added @vercel/node dev dependency

---

### User Request - AI-Generated M&A Targets
> "now let's do AI-generated M&A targets"

### Changes Made
- **AI Generation Service**: Optional Claude API integration for rich deal content
  - Generates unique company backstories and founding history
  - Creates realistic seller motivations (retirement, burnout, disputes, estate planning)
  - Adds interesting quirks about each business
  - Includes red flags for lower quality businesses
  - Highlights upside opportunities for higher quality ones
- **API Key Settings Modal**: User can optionally add their Anthropic API key
  - Key validated before saving
  - Stored securely in localStorage
  - Toggle to enable/disable AI generation
  - Cost estimate displayed (~$0.03 per game)
- **Fallback Content**: Rich static content for all deals even without AI
  - Sector-specific backstories
  - Variety of seller motivations
  - Unique quirks and details
- **Deal Card Enhancement**: Collapsible "Company Story" section showing all AI content
- **Automatic Enhancement**: AI enhancement triggers when entering allocate phase (if enabled)

### Files Created
- `src/services/aiGeneration.ts` - AI generation service with Claude API integration
- `src/components/ui/AISettingsModal.tsx` - Settings UI for API key management

### Files Modified
- `src/engine/types.ts` - Added AIGeneratedContent interface to Deal type
- `src/engine/businesses.ts` - Integrated AI content generation into deal creation
- `src/components/cards/DealCard.tsx` - Added collapsible story section
- `src/components/phases/AllocatePhase.tsx` - Added AI settings button
- `src/components/screens/GameScreen.tsx` - Added AI enhancement trigger on phase change
- `src/hooks/useGame.ts` - Added triggerAIEnhancement action

---

### User Request - Market Guide for Sector Multiples
> "first let's expose multiple ranges in-game for sectors in an educational way so there's some benchmark/baseline for players"

### Changes Made
- **Market Guide Modal**: New educational reference showing all sectors with:
  - Multiple ranges (e.g., SaaS 4.5-8.0x, Agencies 2.5-5.0x)
  - Typical EBITDA ranges
  - Organic growth ranges
  - Volatility rating (Low/Med/High)
  - Recession sensitivity (Defensive/Moderate/Cyclical/Counter-cyclical)
  - CapEx rates
- **Sortable Table**: Sort by Multiple, Stability, Growth, or EBITDA Size
- **Educational Context**: Explains what drives multiples higher/lower
- **Deal Evaluation Tips**: Helps players assess if a deal is fairly priced

### Files Modified
- `src/components/ui/MarketGuideModal.tsx` - New component
- `src/components/phases/AllocatePhase.tsx` - Added Market Guide button in Deals tab

---

### AI Enhancement Discussion & Progress
User asked about layering AI onto the game. Ideas discussed and implementation status:

**Implemented (3 of ~8 ideas):**
- AI-generated M&A targets (backstories, motivations, quirks, red flags)
- Post-game AI analysis (personalized performance review)
- Dynamic narratives (event context, business stories, year chronicles)

**Not yet implemented:**
- **AI Advisor**: In-game AI mentor that offers strategic suggestions based on portfolio state
- **Intelligent Event Chaining**: AI creates multi-year narrative arcs (e.g., recession leads to distressed deals leads to recovery)
- **Competitor Holdcos**: AI-controlled rival holdcos competing for the same deal pipeline
- **DD Conversations**: Interactive due diligence where player asks AI questions about a target business
- **Real-world-inspired events**: Events loosely based on real economic patterns (partial support — not literal current events)

**Rejected:**
- Real-time sector multiples from live market data (breaks game balance, expensive APIs)

---

## Session 3 - Roll-Up M&A Mechanics & Financial Clarity (2026-02-06)

### User Request - Portfolio Valuation Logic
> "i don't quite understand the valuations for the companies in the player's portfolio, they seem to be way lower than what's on the market. what is the basis for the valuations to sell something in your portfolio? how can we make this more logical?"

### Problem Identified
- Original exit valuation used sector average multiple as base
- Added random 0-0.3x modifier that often resulted in selling BELOW acquisition multiple
- Didn't account for value creation (EBITDA growth, platform status, improvements, hold period)

### Changes Made
- **Logical Valuation System**: Exit multiple now starts from acquisition multiple and adds premiums for value created:
  - **Base**: Acquisition multiple (what you paid)
  - **EBITDA Growth Premium**: +0.5x per 100% growth (capped at 1.0x), penalty for shrinkage
  - **Quality Premium**: +0.3x per rating above 3, -0.3x per rating below 3
  - **Platform Premium**: +0.3x per platform scale level (max +0.9x at scale 3)
  - **Hold Period Premium**: +0.1x per year held (max +0.5x at 5+ years)
  - **Improvements Premium**: +0.15x per operational improvement applied
  - **Market Modifier**: +0.5x in bull markets, -0.5x in recessions
  - **Floor**: Minimum 2.0x exit multiple to prevent fire sales
- **Transparent Breakdown**: BusinessCard now shows expandable valuation details
  - Each premium displayed with explanation
  - Shows multiple build-up step by step
  - Net proceeds after debt payoff clearly shown
  - Color-coded gains/losses

### Files Modified
- `src/engine/types.ts` - Added ExitValuation interface
- `src/engine/simulation.ts` - Added calculateExitValuation function
- `src/hooks/useGame.ts` - Updated sellBusiness to use new valuation logic
- `src/components/cards/BusinessCard.tsx` - Added valuation breakdown display
- `src/components/phases/AllocatePhase.tsx` - Added lastEventType prop, passed to BusinessCard
- `src/components/screens/GameScreen.tsx` - Added eventHistory, compute lastEventType, pass to AllocatePhase

---

### User Request - Event Impact Visibility & FCF Waterfall
> "if there is an event that impacts EBITDA or anything else, i'd like to see that delta expressed somewhere. right now, it's hard to tell what the change in ebitda was because of the event (e.g. recession). also, in the cash flow collection screen between years, i'm not sure the debt service for each opco is being reflected, i want to see that calculation so it's clear the EBITDA is not FCF."

### Changes Made
- **Event Impact Tracking**: Events now calculate and display before/after/delta for all affected metrics
  - EBITDA changes show: `$1.2M → $1.0M (-$200k, -15%)`
  - Interest rate changes show: `7.0% → 8.0% (+1.0%)`
  - Cash impacts shown for compliance costs, etc.
- **FCF Waterfall in Collect Phase**: Complete EBITDA-to-FCF breakdown per business
  - Summary bar: EBITDA → CapEx → Taxes → OpCo Debt → HoldCo Costs → Net FCF
  - Expandable detail per business showing:
    - EBITDA
    - (-) CapEx with rate %
    - (-) Taxes at 30%
    - (-) Seller Note Interest + Principal (if any)
    - (-) Bank Debt Interest (if any)
    - = Free Cash Flow with conversion %
  - HoldCo-level deductions shown separately (debt interest, shared services)

### Files Modified
- `src/engine/types.ts` - Added EventImpact interface
- `src/engine/simulation.ts` - Updated applyEventEffects to track and return impacts
- `src/components/cards/EventCard.tsx` - Added impact summary display
- `src/components/phases/CollectPhase.tsx` - Complete rewrite with FCF waterfall

---

### User Request - Roll-Up M&A Mechanics
> "another request: i think as the player conducts M&A, there are opportunities to acquire standalone businesses and opportunities to acquire smaller tuck-ins or to merge two equal sized businesses to recognize synergies and to create a bigger single entity that could benefit from multiple expansion (the PE roll-up play). i think this mechanism needs to be available because then it enriches the M&A potential for the business. i do think some integrations will work better than others or be more or less painful than others, so those are factors to build in as well."

### Changes Made
- **Acquisition Types**: Added three types - Standalone, Tuck-In, Platform
- **Platform Mechanics**: Businesses can be designated as platforms (scale 1-3) to receive bolt-ons
- **Tuck-In Acquisitions**: Smaller businesses can be folded into existing platforms for synergies
- **Multiple Expansion**: Platform scale grants +0.3x to +1.0x valuation premium (the roll-up premium)
- **Merge Businesses**: Combine two owned same-sector businesses into a larger platform
- **Integration Outcomes**: Success/Partial/Failure system based on quality, operator strength, sector match
- **Synergies**: Successful integrations add 10-20% EBITDA; failures can hurt (-5% to -10%)
- **Tuck-In Discounts**: Smaller businesses sell at 5-25% discount (need platform support)
- **UI Updates**: Platform badges, merge modal, tuck-in selection in deal structuring

### Files Modified
- `src/engine/types.ts` - Added AcquisitionType, IntegrationOutcome, platform fields on Business
- `src/engine/businesses.ts` - Added integration outcome logic, synergy calculations, multiple expansion
- `src/hooks/useGame.ts` - Added acquireTuckIn, mergeBusinesses, designatePlatform actions
- `src/components/phases/AllocatePhase.tsx` - Added merge modal, tuck-in platform selection, roll-up strategy UI
- `src/components/cards/DealCard.tsx` - Added acquisition type badges, tuck-in indicators
- `src/components/cards/BusinessCard.tsx` - Added platform designation button, platform status display

---

## Session 2 - Game Polish & M&A Focus (Previous Session)

### User Request - Starting Sector Choice
> "why is the default starting business always an agency btw?"
> "let the player choose"

### Changes Made
- Added sector selection grid to IntroScreen
- Player can now choose from all 10 sectors for their starting business
- Updated `createStartingBusiness()` to accept sector parameter

### User Request - M&A Focus Feature
> "not really seeing the older deals 'expire' -- i still see them the next year. also think that if i am trying to do a sector-focused M&A, it sucks not to have deal flow for that sector, i feel like there just needs to be much more options for M&A each year including a few sector choices of varying quality/prices, and perhaps we can even have a feature where the user can 'define M&A focus' and choose from option of indicating sector specificity and size."

### Changes Made
- Increased deal pipeline to 4-8 deals per year with sector variety
- Added M&A Focus feature with sector and size preference dropdowns
- Deals now generate based on M&A focus preferences
- Clearer deal expiration labels ("Expires next year" vs "2 years left")
- Deals expire after 2 years (was 3)
- Added MAFocus type with sectorId and sizePreference

### User Request - Dollar Scaling & Cap Table
> "the on-hover descriptions for the components up top (cash, ebitda, etc.) are cut off on the screen at the top since they appear above the components, please fix. also, i noticed the denominations of the dollars are still very low. i think revenue and ebitda should be in the millions and hundreds of thousands. if you reference my book and the Bucket Group example, you'll see what scale i am talking about. please adjust. lastly, it's confusing that the instruction screen says we raised capital to start, but i'd like to be more explicit about how much we raised and what % of the company we gave up for it. i don't see any cap table type of consideration here and i think we need to make sure the player maintains cap table control but can issue up to a certain amount of shares to raise capital up to a limit."

### Changes Made
- Fixed tooltip positioning (changed from `bottom-full` to `top-full`)
- Updated `formatMoney()` to properly display millions (values stored in thousands)
- Added cap table mechanics:
  - Initial raise: $20M
  - Founder keeps 80% (800 of 1000 shares)
  - 51% minimum ownership protection when issuing equity
  - Dashboard shows ownership percentage
- Updated InstructionsModal to explain cap table clearly

### User Request - Tutorial Popup
> (Requested RPG-style tutorial popup when game starts)

### Changes Made
- Created InstructionsModal with 5 pages:
  1. Welcome & premise
  2. Annual cycle (Collect, Event, Allocate)
  3. Key metrics to watch
  4. Capital allocation hierarchy
  5. Tips for success
- Shows on first play, remembers via localStorage
- Can be re-opened via "?" button in header

---

## Session 1 - Core Game Conversion (Earlier Session)

### User Request - Time Conversion
> (Convert from 20 quarters to 20 years)

### Changes Made
- Changed game duration from quarters to years
- Updated all references and UI
- Adjusted growth rates and timing for annual cadence

### User Request - Enterprise Value & Leaderboard
> (Add enterprise value calculation and leaderboard)

### Changes Made
- Added enterprise value calculation
- Created leaderboard system with localStorage persistence
- Added LeaderboardEntry type

---

## Design Philosophy Notes

Based on Peter Kang's "The Holdco Guide":

1. **Capital Allocation Hierarchy**: Reinvest at high ROIIC > Deleverage > Buyback > Distribute
2. **Sector Focus**: Concentration in 1-2 sectors unlocks synergies and expertise
3. **Debt Structure**: Push debt close to the asset, avoid parent guarantees
4. **Long-term Compounding**: 20-year horizon rewards patient capital deployment
5. **Roll-Up Strategy**: Platform + bolt-ons = multiple expansion (PE playbook)

---

## Future Considerations

### AI Features (from brainstorm)
- [ ] AI Advisor — in-game strategic mentor suggesting moves based on portfolio state
- [ ] Intelligent Event Chaining — multi-year narrative arcs driven by AI
- [ ] Competitor Holdcos — AI-controlled rivals competing for deals
- [ ] DD Conversations — interactive due diligence Q&A with AI
- [ ] Real-world-inspired events — loosely based on real economic patterns

### Gameplay Features (from PRD v2.0, not yet built)
- [ ] Cash Flow River Animation — Sankey-style animated flow visualization
- [ ] Portfolio Health Heatmap — at-a-glance portfolio composition bar
- [ ] Difficulty Modes — Easy/Normal/Hard with different parameters
- [ ] Holdco Archetype Selection — Capital Allocator/Operational/Roll-Up starting style
- [ ] Sound Design — UI sounds for cash collection, acquisitions, events
- [ ] Share-Your-Score Image Generation — shareable game-over card
- [ ] Responsive Mobile Layout — optimize for tablet/phone
- [ ] Sector Focus Event Modifiers — reduce negative event impact at Tier 2+
- [ ] Earn-out Resolution — track whether earn-out targets are hit over time
- [ ] Bank Debt Amortization — 10-year repayment schedule

### Gameplay Ideas (from sessions)
- [ ] More detailed integration mechanics (cultural fit, technology integration)
- [ ] Management team quality affecting outcomes
- [ ] Economic cycles affecting deal flow and valuations
- [ ] Strategic buyer exits vs financial buyer exits
- [ ] Add-on acquisition sourcing bonuses for established platforms
- [ ] Industry-specific events and dynamics
