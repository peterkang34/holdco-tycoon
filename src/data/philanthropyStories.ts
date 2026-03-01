export interface PhilanthropyStory {
  category: string;
  emoji: string;
  title: string;
  narrative: (amount: string) => string;
}

export const PHILANTHROPY_STORIES: PhilanthropyStory[] = [
  {
    category: 'Arts & Culture',
    emoji: '🎭',
    title: 'A Downtown Reborn',
    narrative: (amount) =>
      `Your ${amount} gift funded a community arts center that became the anchor of a revitalized downtown cultural district. Within two years, the center hosted over 400 performances and exhibitions, drawing 50,000 visitors annually and sparking a wave of small business openings on surrounding blocks.`,
  },
  {
    category: 'Global Health',
    emoji: '🏥',
    title: 'Clinics Without Borders',
    narrative: (amount) =>
      `A fleet of mobile clinics, funded by your ${amount} contribution, now serves rural communities across sub-Saharan Africa. Over 120,000 patients received vaccinations, prenatal care, and malaria treatment in regions where the nearest hospital was a full day's journey away.`,
  },
  {
    category: 'Higher Education',
    emoji: '🎓',
    title: 'First in the Family',
    narrative: (amount) =>
      `Your ${amount} endowment created a scholarship program for first-generation college students at a state university. In its inaugural class, 85 students enrolled who otherwise couldn't have afforded tuition — 92% are on track to graduate, many the first in their families to earn a degree.`,
  },
  {
    category: 'Environmental Conservation',
    emoji: '🌿',
    title: 'Watershed Protected',
    narrative: (amount) =>
      `With ${amount}, your foundation permanently protected 12,000 acres of critical watershed and coastal habitat. Native fish populations rebounded 40% within three years, and the restored wetlands now filter drinking water for two downstream communities.`,
  },
  {
    category: 'Civic Discourse',
    emoji: '📰',
    title: 'Journalism Restored',
    narrative: (amount) =>
      `Your ${amount} local journalism fund hired a team of investigative reporters at a struggling regional newspaper. Their first year produced a Pulitzer-nominated series on municipal corruption, leading to three indictments and a wave of civic engagement that doubled voter turnout in local elections.`,
  },
  {
    category: 'Medical Research',
    emoji: '🧬',
    title: 'The Breakthrough Lab',
    narrative: (amount) =>
      `A ${amount} grant established a rare disease research lab at a leading medical center. Within 18 months, the team identified a promising gene therapy candidate now in Phase II clinical trials — offering hope to 30,000 families affected by the condition nationwide.`,
  },
  {
    category: 'Youth Development',
    emoji: '🚀',
    title: 'After-School Revolution',
    narrative: (amount) =>
      `Your ${amount} investment launched after-school STEM and mentorship programs across 15 underserved urban neighborhoods. Over 3,000 students gained access to robotics labs, coding workshops, and college-prep mentoring — and the program's first cohort saw a 60% increase in college enrollment.`,
  },
  {
    category: 'Food Security',
    emoji: '🌾',
    title: 'No Family Goes Hungry',
    narrative: (amount) =>
      `A regional food bank network and urban farming cooperative, built with your ${amount} gift, now distributes 2 million meals annually. The cooperative trained 200 residents as urban farmers, creating both jobs and a sustainable local food supply for food-desert communities.`,
  },
  {
    category: 'Technology Access',
    emoji: '💻',
    title: 'Connected Communities',
    narrative: (amount) =>
      `Your ${amount} funded broadband infrastructure and digital literacy centers in 8 rural and tribal communities. Over 15,000 residents gained reliable internet access for the first time, enabling telehealth appointments, remote work, and online education in areas previously left behind.`,
  },
  {
    category: 'Disaster Resilience',
    emoji: '🛡️',
    title: 'Ready Before the Storm',
    narrative: (amount) =>
      `With ${amount}, your foundation built community disaster-preparedness infrastructure — reinforced shelters, emergency supply caches, and a rapid-response fund — across a hurricane-prone coastal region. When the next major storm hit, evacuation times dropped 35% and recovery began within days, not months.`,
  },
  {
    category: 'Mental Health',
    emoji: '💚',
    title: 'Someone to Call',
    narrative: (amount) =>
      `Your ${amount} contribution opened three free counseling clinics and expanded a regional crisis hotline to 24/7 coverage. In the first year, the clinics served 8,000 patients and the hotline fielded 45,000 calls — connecting people in crisis with trained counselors when they needed it most.`,
  },
  {
    category: 'Developing Nations',
    emoji: '🌏',
    title: 'Water, Then Opportunity',
    narrative: (amount) =>
      `A ${amount} investment brought clean water infrastructure to 25 villages in Southeast Asia, serving 60,000 people. With waterborne illness rates cut by 70%, the program's micro-enterprise loans helped 1,200 families start small businesses — turning survival into self-sufficiency.`,
  },
];
