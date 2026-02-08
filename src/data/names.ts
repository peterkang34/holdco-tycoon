// Combinatorial business name generator — produces thousands of unique names per sector
// by combining prefixes, core words, and suffixes. Never runs out.

interface NameParts {
  prefixes: string[];
  cores: string[];
  suffixes: string[];
}

const SECTOR_NAME_PARTS: Record<string, NameParts> = {
  agency: {
    prefixes: ['Pixel', 'Spark', 'Brand', 'Digital', 'Metric', 'Clear', 'Neon', 'Prism', 'Beacon', 'Signal', 'Nova', 'Vivid', 'Bold', 'Bright', 'Sharp', 'Core', 'True', 'Prime', 'Open', 'Next'],
    cores: ['Wave', 'Edge', 'Path', 'Fire', 'Pulse', 'Lab', 'Lens', 'Arc', 'Link', 'Shift', 'Flow', 'Cast', 'Craft', 'Hive', 'Grid', 'Mark', 'Volt', 'Flux', 'Dot', 'Ink'],
    suffixes: ['Creative', 'Media', 'Agency', 'Studios', 'Digital', 'Group', 'Co', 'Partners', 'Collective', ''],
  },
  saas: {
    prefixes: ['Cloud', 'Data', 'Flow', 'Nimbus', 'Core', 'Apex', 'Stream', 'Task', 'Sync', 'Insight', 'Pipe', 'Auto', 'Clear', 'Base', 'Quantum', 'Orbit', 'Vertex', 'Logic', 'Dash', 'Relay'],
    cores: ['Sync', 'Pulse', 'Stack', 'Wave', 'Line', 'Forge', 'Master', 'Link', 'Hub', 'Grid', 'Base', 'Wire', 'Dock', 'Mint', 'Beam', 'Nest', 'Rack', 'Tap', 'Mesh', 'Kit'],
    suffixes: ['Systems', '.io', 'Pro', 'Software', 'HQ', 'Cloud', 'Platform', 'Analytics', 'Labs', ''],
  },
  homeServices: {
    prefixes: ['Summit', 'Comfort', 'Guardian', 'Reliable', 'Peak', 'Trust', 'Horizon', 'Evergreen', 'Shield', 'Apex', 'Blue', 'Premier', 'Solid', 'Clear', 'First', 'Patriot', 'Liberty', 'Eagle', 'Valley', 'Golden'],
    cores: ['Point', 'Star', 'Rock', 'Line', 'Call', 'Ridge', 'Creek', 'View', 'Mark', 'Field', 'Stone', 'Crest', 'Haven', 'Lake', 'Bay', 'Gate', 'Dale', 'Brook', 'Glen', 'Bend'],
    suffixes: ['Plumbing', 'HVAC', 'Services', 'Electric', 'Roofing', 'Pest Control', 'Property Care', 'Home Pro', 'Comfort', 'Solutions'],
  },
  consumer: {
    prefixes: ['Artisan', 'Pure', 'Heritage', 'Modern', 'Craft', 'Wild', 'True', 'Native', 'Golden', 'Coastal', 'Urban', 'Rustic', 'Fresh', 'Nordic', 'Harbor', 'Cedar', 'Maple', 'Stone', 'River', 'Iron'],
    cores: ['Wood', 'Root', 'Moon', 'Leaf', 'Bloom', 'Oak', 'Pine', 'Sage', 'Reed', 'Wren', 'Fern', 'Moss', 'Birch', 'Elm', 'Clay', 'Dusk', 'Dawn', 'Vale', 'Glen', 'Ridge'],
    suffixes: ['Goods Co', 'Brand', 'Essentials', '& Co', 'Living', 'Supply', 'Provisions', 'Market', 'Trading', ''],
  },
  industrial: {
    prefixes: ['Precision', 'Apex', 'Sterling', 'Core', 'Summit', 'Delta', 'Titan', 'Forge', 'Granite', 'Atlas', 'Iron', 'Vanguard', 'Anchor', 'Patriot', 'Centurion', 'Pinnacle', 'Vulcan', 'Nexus', 'Cobalt', 'Chromium'],
    cores: ['Tech', 'Clad', 'Stone', 'Steel', 'Bolt', 'Weld', 'Cast', 'Mill', 'Works', 'Alloy', 'Craft', 'Forge', 'Guard', 'Lock', 'Grip', 'Port', 'Link', 'Core', 'Edge', 'Arc'],
    suffixes: ['Industries', 'Manufacturing', 'Components', 'Inc', 'Precision', 'Solutions', 'Systems', 'Industrial', 'Engineering', ''],
  },
  b2bServices: {
    prefixes: ['Tech', 'Clarity', 'Pinnacle', 'Strategic', 'Core', 'Fusion', 'Insight', 'Elevate', 'Meridian', 'Vantage', 'Prime', 'Blueprint', 'Vector', 'Mosaic', 'Lumen', 'Arbor', 'Praxis', 'Scope', 'Vertex', 'Nuvio'],
    cores: ['Serve', 'Path', 'Point', 'Link', 'Hub', 'Bridge', 'Scope', 'Ware', 'Logic', 'Source', 'Tier', 'Deck', 'Node', 'Gate', 'Base', 'Dock', 'Sage', 'Lens', 'Mark', 'Grid'],
    suffixes: ['Solutions', 'Consulting', 'Services', 'Partners', 'Group', 'Advisory', 'IT', 'Analytics', 'Corp', ''],
  },
  healthcare: {
    prefixes: ['Wellness', 'Premier', 'Vitality', 'Compass', 'Evergreen', 'Summit', 'Horizon', 'Unity', 'Guardian', 'Bright', 'Care', 'Beacon', 'Thrive', 'Alliance', 'Harmony', 'Genesis', 'Ascent', 'Harbor', 'Sage', 'Haven'],
    cores: ['Path', 'Point', 'View', 'Spring', 'Bridge', 'Gate', 'Well', 'Leaf', 'Crest', 'Lake', 'Ridge', 'Field', 'Stone', 'Glen', 'Pointe', 'Bay', 'Vale', 'Grove', 'Park', 'Haven'],
    suffixes: ['Health', 'Medical Group', 'Care', 'Partners', 'Healthcare', 'Medical', 'Wellness', 'Health Partners', 'Clinical', ''],
  },
  restaurant: {
    prefixes: ['Urban', 'Fresh', 'Local', 'Daily', 'Harvest', 'Street', 'Copper', 'Modern', 'Farm', 'Craft', 'Downtown', 'Morning', 'Rustic', 'City', 'Golden', 'Silver', 'Red', 'Blue', 'Green', 'Oak'],
    cores: ['Kitchen', 'Table', 'Grill', 'Brew', 'Bistro', 'Eats', 'Kettle', 'Diner', 'Fork', 'Plate', 'Hearth', 'Pantry', 'Oven', 'Skillet', 'Barrel', 'Spoon', 'Cup', 'Bowl', 'Toast', 'Flame'],
    suffixes: ['Co', '& Co', 'Cafe', 'Eatery', 'Restaurant', 'House', 'Kitchen', 'Bar', 'Spot', ''],
  },
  realEstate: {
    prefixes: ['Keystone', 'Summit', 'Metro', 'Granite', 'Horizon', 'Prime', 'Urban', 'Anchor', 'Evergreen', 'Pacific', 'Atlas', 'Meridian', 'Pinnacle', 'Central', 'Gateway', 'Sterling', 'Foundation', 'Vanguard', 'Capitol', 'Liberty'],
    cores: ['Core', 'Point', 'Park', 'Square', 'Plaza', 'Tower', 'Gate', 'Ridge', 'Crest', 'Bay', 'Harbor', 'Landing', 'Crossing', 'Station', 'Terrace', 'Heights', 'View', 'Bluff', 'Field', 'Glen'],
    suffixes: ['Properties', 'Storage', 'Logistics', 'Real Estate', 'Holdings', 'REIT', 'Capital', 'Partners', 'Realty', ''],
  },
  education: {
    prefixes: ['Skill', 'Elevate', 'Career', 'Knowledge', 'Learn', 'Ascent', 'Next', 'Clarity', 'Master', 'Upskill', 'Path', 'Growth', 'Insight', 'Thrive', 'Catalyst', 'Summit', 'Progress', 'Advantage', 'Excel', 'Bright'],
    cores: ['Path', 'Forge', 'Hub', 'Pro', 'Step', 'Class', 'Mind', 'Spark', 'Leap', 'Track', 'Way', 'Arc', 'Bridge', 'Gate', 'Rise', 'Quest', 'Edge', 'Reach', 'Zone', 'Tier'],
    suffixes: ['Academy', 'Learning', 'Education', 'Institute', 'Training', 'School', 'Lab', 'Center', 'Pro', ''],
  },
};

// Sub-type → suffixes map: ensures the name suffix matches the business sub-type
const SUBTYPE_SUFFIXES: Record<string, string[]> = {
  // agency
  'Digital/Ecommerce Agency': ['Digital', 'Digital Agency', 'Ecommerce', 'Online', 'Interactive'],
  'Creative/Brand Agency': ['Creative', 'Studios', 'Brand Agency', 'Creative Co', 'Design'],
  'Performance Media Agency': ['Media', 'Performance', 'Media Group', 'Advertising', 'Ads'],
  'SEO/Content Agency': ['Content', 'SEO', 'Publishing', 'Content Co', 'Search'],
  'Web Development Agency': ['Web', 'Dev', 'Interactive', 'Web Studio', 'Development'],
  // saas
  'Vertical-Market SaaS': ['Systems', 'Software', 'Platform', 'Solutions', 'Suite'],
  'Horizontal SaaS': ['Cloud', 'HQ', 'Pro', 'Platform', 'Suite'],
  'Dev Tools / Infrastructure': ['Labs', '.io', 'Dev', 'Tools', 'Infra'],
  'Micro-SaaS Product': ['App', '.io', 'Pro', 'Kit', 'Lite'],
  // homeServices
  'HVAC Services': ['HVAC', 'Heating & Air', 'Climate', 'Comfort', 'Air Systems'],
  'Plumbing Services': ['Plumbing', 'Plumbing Co', 'Pipe & Drain', 'Water Works', 'Plumbing Pro'],
  'Electrical Services': ['Electric', 'Electrical', 'Power', 'Wiring', 'Electric Co'],
  'Pest Control': ['Pest Control', 'Exterminators', 'Pest Solutions', 'Bug Guard', 'Pest Pro'],
  'Property Management': ['Property Mgmt', 'Maintenance', 'Property Services', 'Property Care', 'Management'],
  'Roofing / Exterior Services': ['Roofing', 'Exteriors', 'Roof & Siding', 'Roofing Co', 'Roof Pro'],
  // consumer
  'DTC / Ecommerce Brand': ['Brand', '& Co', 'Supply', 'Direct', 'Shop'],
  'CPG / Household Goods': ['Goods Co', 'Essentials', 'Supply', 'Home', 'Household'],
  'Food & Beverage Brand': ['Foods', 'Provisions', 'Kitchen', 'Pantry', 'Eats'],
  'Beauty / Personal Care': ['Beauty', 'Naturals', 'Glow', 'Care', 'Cosmetics'],
  'Specialty / Luxury Goods': ['& Co', 'Luxury', 'Atelier', 'Curated', 'Collection'],
  'Spirits / Wine': ['Spirits', 'Distillery', 'Cellars', 'Vineyards', 'Brewing'],
  // industrial
  'Precision Parts / Components': ['Precision', 'Components', 'Parts', 'Manufacturing', 'Machining'],
  'Aerospace Aftermarket': ['Aerospace', 'Aviation', 'Aero', 'Flight Systems', 'Aero Parts'],
  'Specialty Instruments / Testing': ['Instruments', 'Testing', 'Analytical', 'Measurement', 'Diagnostics'],
  'Industrial Distribution': ['Supply', 'Distribution', 'Industrial', 'Wholesale', 'Logistics'],
  'Engineered Products': ['Engineering', 'Solutions', 'Industries', 'Systems', 'Products'],
  // b2bServices
  'IT Managed Services (MSP)': ['IT', 'Tech Solutions', 'Systems', 'Managed IT', 'Technology'],
  'Finance / Accounting Services': ['Advisory', 'Accounting', 'Financial', 'CPA Group', 'Bookkeeping'],
  'HR / Staffing': ['Staffing', 'Talent', 'HR Solutions', 'Recruiting', 'People'],
  'Consulting / Advisory': ['Consulting', 'Advisory', 'Partners', 'Strategy', 'Advisors'],
  'Data / Analytics Services': ['Analytics', 'Data', 'Insights', 'Intelligence', 'Data Co'],
  // healthcare
  'Physician Group / Multi-Specialty Practice': ['Medical Group', 'Healthcare', 'Medical', 'Physicians', 'Clinic'],
  'Dental Practice Group': ['Dental', 'Dentistry', 'Dental Care', 'Smile', 'Dental Group'],
  'Ophthalmology / Specialty Care': ['Eye Care', 'Vision', 'Specialty Care', 'Eye Center', 'Optical'],
  'Home Health / Hospice': ['Home Health', 'Care', 'Home Care', 'Hospice', 'Health Services'],
  'Behavioral Health': ['Behavioral Health', 'Wellness', 'Counseling', 'Mental Health', 'Therapy'],
  // restaurant
  'QSR / Fast Casual Franchise': ['Grill', 'Eats', 'Express', 'Quick', 'To-Go'],
  'Casual Dining': ['Restaurant', 'Kitchen', 'Bistro', 'Bar & Grill', 'Dining'],
  'Coffee / Beverage Concept': ['Cafe', 'Coffee', 'Brew', 'Roasters', 'Tea House'],
  'Ghost Kitchen / Delivery-First': ['Kitchen', 'Eats', 'Delivery', 'To-Go', 'Express'],
  'Specialty Food Concept': ['Eatery', 'House', 'Spot', 'Co', 'Food Co'],
  // realEstate
  'Self-Storage': ['Storage', 'Self-Storage', 'Storage Co', 'Space', 'Stor'],
  'Multi-Family Residential': ['Properties', 'Residential', 'Living', 'Apartments', 'Realty'],
  'Industrial / Logistics Warehousing': ['Logistics', 'Warehousing', 'Industrial', 'Distribution', 'Freight'],
  'Data Centers': ['Data Centers', 'Digital', 'Hosting', 'Data', 'Colo'],
  'Utility / Infrastructure': ['Infrastructure', 'Utilities', 'Holdings', 'Capital', 'Power'],
  // education
  'Online Learning Platform': ['Learning', 'Academy', 'Education', 'Online', 'EdTech'],
  'Vocational / Trade School': ['Institute', 'School', 'Training', 'Academy', 'Trades'],
  'EdTech SaaS': ['Lab', 'Ed', 'Tech', 'Pro', 'Platform'],
  'Corporate Training': ['Training', 'Development', 'Pro', 'Center', 'Workforce'],
  'Test Prep / Tutoring': ['Prep', 'Tutoring', 'Academy', 'School', 'Test Prep'],
};

// Track used names to avoid duplicates within a game
let usedNames: Set<string> = new Set();

export function resetUsedNames(): void {
  usedNames = new Set();
}

function buildName(parts: NameParts): string {
  const prefix = parts.prefixes[Math.floor(Math.random() * parts.prefixes.length)];
  const core = parts.cores[Math.floor(Math.random() * parts.cores.length)];
  const suffix = parts.suffixes[Math.floor(Math.random() * parts.suffixes.length)];

  // Vary the structure for diversity
  const roll = Math.random();
  if (roll < 0.4) {
    // "Prefix Core Suffix" — e.g. "Titan Steel Industries"
    return [prefix, core, suffix].filter(Boolean).join(' ');
  } else if (roll < 0.7) {
    // "PrefixCore Suffix" — e.g. "IronClad Manufacturing"
    return [prefix + core, suffix].filter(Boolean).join(' ');
  } else if (roll < 0.85) {
    // "Prefix Suffix" — e.g. "Apex Industries"
    return [prefix, suffix].filter(Boolean).join(' ') || prefix;
  } else {
    // "Core & Prefix" or "The Core Suffix" — e.g. "Steel & Titan" or "The Forge Co"
    if (Math.random() < 0.5) {
      return `${core} & ${prefix}`;
    }
    return ['The', core, suffix].filter(Boolean).join(' ');
  }
}

export function getRandomBusinessName(sectorId: string, subType?: string): string {
  const sectorParts = SECTOR_NAME_PARTS[sectorId] || SECTOR_NAME_PARTS.agency;

  // If sub-type has specific suffixes, override the sector-wide ones
  const parts: NameParts = subType && SUBTYPE_SUFFIXES[subType]
    ? { ...sectorParts, suffixes: SUBTYPE_SUFFIXES[subType] }
    : sectorParts;

  // Try up to 20 times to get a unique name
  for (let i = 0; i < 20; i++) {
    const name = buildName(parts);
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }

  // Extremely unlikely fallback — prefix + core guaranteed unique combo
  const prefix = parts.prefixes[Math.floor(Math.random() * parts.prefixes.length)];
  const core = parts.cores[Math.floor(Math.random() * parts.cores.length)];
  const suffix = parts.suffixes[Math.floor(Math.random() * parts.suffixes.length)];
  const name = [prefix, core, suffix, Math.floor(Math.random() * 99) + 1].filter(Boolean).join(' ');
  usedNames.add(name);
  return name;
}

// Backwards compatibility — not used anymore but kept for any external references
export const BUSINESS_NAMES: Record<string, string[]> = Object.fromEntries(
  Object.entries(SECTOR_NAME_PARTS).map(([sector, parts]) => [
    sector,
    parts.prefixes.slice(0, 5).map((p, i) => `${p} ${parts.cores[i]} ${parts.suffixes[i]}`.trim()),
  ])
);
