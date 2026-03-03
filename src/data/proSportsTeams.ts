// Pro Sports Teams Database
// Real teams with relative valuations reflecting franchise value tiers
// EBITDA values in thousands ($K)

export type ProSportsLeague =
  | 'nfl'
  | 'nba'
  | 'mlb'
  | 'nhl'
  | 'epl'
  | 'mls'
  | 'wnba'
  | 'nwsl';

export interface ProSportsTeam {
  name: string;
  league: ProSportsLeague;
  ebitdaRange: [number, number];
  multipleRange: [number, number];
}

export interface LeagueConfig {
  id: ProSportsLeague;
  label: string;
  fullName: string;
  tier: 'mega' | 'major' | 'growth' | 'women';
  teamCount: number;
}

export const LEAGUE_CONFIGS: Record<ProSportsLeague, LeagueConfig> = {
  nfl: {
    id: 'nfl',
    label: 'NFL',
    fullName: 'National Football League',
    tier: 'mega',
    teamCount: 32,
  },
  nba: {
    id: 'nba',
    label: 'NBA',
    fullName: 'National Basketball Association',
    tier: 'major',
    teamCount: 30,
  },
  mlb: {
    id: 'mlb',
    label: 'MLB',
    fullName: 'Major League Baseball',
    tier: 'major',
    teamCount: 30,
  },
  epl: {
    id: 'epl',
    label: 'EPL',
    fullName: 'English Premier League',
    tier: 'major',
    teamCount: 20,
  },
  nhl: {
    id: 'nhl',
    label: 'NHL',
    fullName: 'National Hockey League',
    tier: 'growth',
    teamCount: 32,
  },
  mls: {
    id: 'mls',
    label: 'MLS',
    fullName: 'Major League Soccer',
    tier: 'growth',
    teamCount: 29,
  },
  wnba: {
    id: 'wnba',
    label: 'WNBA',
    fullName: "Women's National Basketball Association",
    tier: 'women',
    teamCount: 13,
  },  // EBITDA: 5,000–25,000 | Multiples: 12–20x | Valuations: ~$60M–$500M
  nwsl: {
    id: 'nwsl',
    label: 'NWSL',
    fullName: "National Women's Soccer League",
    tier: 'women',
    teamCount: 14,
  },  // EBITDA: 3,000–18,000 | Multiples: 10–18x | Valuations: ~$30M–$324M
};

export const PRO_SPORTS_TEAMS: ProSportsTeam[] = [
  // ============================================================
  // NFL — 32 teams
  // Tier: mega | EBITDA: 80,000–200,000 | Multiples: 15–25x
  // ============================================================

  // Tier 1 — Elite franchises
  { name: 'Dallas Cowboys', league: 'nfl', ebitdaRange: [170000, 200000], multipleRange: [22, 25] },
  { name: 'New England Patriots', league: 'nfl', ebitdaRange: [160000, 190000], multipleRange: [21, 25] },
  { name: 'New York Giants', league: 'nfl', ebitdaRange: [155000, 185000], multipleRange: [21, 24] },
  { name: 'Los Angeles Rams', league: 'nfl', ebitdaRange: [155000, 185000], multipleRange: [21, 24] },
  { name: 'San Francisco 49ers', league: 'nfl', ebitdaRange: [150000, 180000], multipleRange: [20, 24] },
  { name: 'Chicago Bears', league: 'nfl', ebitdaRange: [145000, 175000], multipleRange: [20, 23] },
  { name: 'Washington Commanders', league: 'nfl', ebitdaRange: [145000, 175000], multipleRange: [20, 23] },
  { name: 'New York Jets', league: 'nfl', ebitdaRange: [140000, 170000], multipleRange: [20, 23] },

  // Tier 2 — High-value franchises
  { name: 'Philadelphia Eagles', league: 'nfl', ebitdaRange: [135000, 165000], multipleRange: [19, 22] },
  { name: 'Houston Texans', league: 'nfl', ebitdaRange: [130000, 160000], multipleRange: [19, 22] },
  { name: 'Denver Broncos', league: 'nfl', ebitdaRange: [130000, 160000], multipleRange: [19, 22] },
  { name: 'Seattle Seahawks', league: 'nfl', ebitdaRange: [125000, 155000], multipleRange: [18, 22] },
  { name: 'Miami Dolphins', league: 'nfl', ebitdaRange: [125000, 155000], multipleRange: [18, 22] },
  { name: 'Las Vegas Raiders', league: 'nfl', ebitdaRange: [125000, 150000], multipleRange: [18, 21] },
  { name: 'Green Bay Packers', league: 'nfl', ebitdaRange: [120000, 150000], multipleRange: [18, 21] },
  { name: 'Pittsburgh Steelers', league: 'nfl', ebitdaRange: [120000, 150000], multipleRange: [18, 21] },

  // Tier 3 — Mid-value franchises
  { name: 'Baltimore Ravens', league: 'nfl', ebitdaRange: [115000, 145000], multipleRange: [17, 20] },
  { name: 'Minnesota Vikings', league: 'nfl', ebitdaRange: [115000, 140000], multipleRange: [17, 20] },
  { name: 'Kansas City Chiefs', league: 'nfl', ebitdaRange: [115000, 145000], multipleRange: [17, 21] },
  { name: 'Atlanta Falcons', league: 'nfl', ebitdaRange: [110000, 140000], multipleRange: [17, 20] },
  { name: 'Los Angeles Chargers', league: 'nfl', ebitdaRange: [110000, 140000], multipleRange: [17, 20] },
  { name: 'Tampa Bay Buccaneers', league: 'nfl', ebitdaRange: [110000, 135000], multipleRange: [17, 20] },
  { name: 'Carolina Panthers', league: 'nfl', ebitdaRange: [105000, 130000], multipleRange: [16, 19] },
  { name: 'Cleveland Browns', league: 'nfl', ebitdaRange: [105000, 130000], multipleRange: [16, 19] },

  // Tier 4 — Lower-value franchises
  { name: 'Indianapolis Colts', league: 'nfl', ebitdaRange: [100000, 125000], multipleRange: [16, 19] },
  { name: 'New Orleans Saints', league: 'nfl', ebitdaRange: [100000, 125000], multipleRange: [16, 19] },
  { name: 'Arizona Cardinals', league: 'nfl', ebitdaRange: [95000, 120000], multipleRange: [16, 19] },
  { name: 'Tennessee Titans', league: 'nfl', ebitdaRange: [95000, 120000], multipleRange: [15, 18] },
  { name: 'Detroit Lions', league: 'nfl', ebitdaRange: [95000, 120000], multipleRange: [15, 18] },
  { name: 'Jacksonville Jaguars', league: 'nfl', ebitdaRange: [80000, 100000], multipleRange: [15, 18] },
  { name: 'Cincinnati Bengals', league: 'nfl', ebitdaRange: [85000, 105000], multipleRange: [15, 18] },
  { name: 'Buffalo Bills', league: 'nfl', ebitdaRange: [85000, 110000], multipleRange: [15, 18] },

  // ============================================================
  // NBA — 30 teams
  // Tier: major | EBITDA: 50,000–120,000 | Multiples: 14–25x
  // ============================================================

  // Tier 1 — Elite franchises
  { name: 'Golden State Warriors', league: 'nba', ebitdaRange: [100000, 120000], multipleRange: [22, 25] },
  { name: 'New York Knicks', league: 'nba', ebitdaRange: [100000, 120000], multipleRange: [22, 25] },
  { name: 'Los Angeles Lakers', league: 'nba', ebitdaRange: [95000, 115000], multipleRange: [22, 25] },
  { name: 'Boston Celtics', league: 'nba', ebitdaRange: [90000, 110000], multipleRange: [21, 24] },
  { name: 'Los Angeles Clippers', league: 'nba', ebitdaRange: [85000, 105000], multipleRange: [20, 24] },
  { name: 'Chicago Bulls', league: 'nba', ebitdaRange: [85000, 105000], multipleRange: [20, 23] },

  // Tier 2 — High-value franchises
  { name: 'Brooklyn Nets', league: 'nba', ebitdaRange: [80000, 100000], multipleRange: [19, 22] },
  { name: 'Houston Rockets', league: 'nba', ebitdaRange: [80000, 100000], multipleRange: [19, 22] },
  { name: 'Dallas Mavericks', league: 'nba', ebitdaRange: [78000, 95000], multipleRange: [19, 22] },
  { name: 'Philadelphia 76ers', league: 'nba', ebitdaRange: [75000, 95000], multipleRange: [18, 22] },
  { name: 'Miami Heat', league: 'nba', ebitdaRange: [75000, 95000], multipleRange: [18, 22] },
  { name: 'Toronto Raptors', league: 'nba', ebitdaRange: [75000, 92000], multipleRange: [18, 21] },

  // Tier 3 — Mid-value franchises
  { name: 'Phoenix Suns', league: 'nba', ebitdaRange: [70000, 88000], multipleRange: [17, 21] },
  { name: 'Portland Trail Blazers', league: 'nba', ebitdaRange: [68000, 85000], multipleRange: [17, 20] },
  { name: 'Sacramento Kings', league: 'nba', ebitdaRange: [65000, 82000], multipleRange: [17, 20] },
  { name: 'Denver Nuggets', league: 'nba', ebitdaRange: [65000, 82000], multipleRange: [17, 20] },
  { name: 'Washington Wizards', league: 'nba', ebitdaRange: [65000, 80000], multipleRange: [16, 20] },
  { name: 'Milwaukee Bucks', league: 'nba', ebitdaRange: [62000, 80000], multipleRange: [16, 19] },
  { name: 'Atlanta Hawks', league: 'nba', ebitdaRange: [62000, 78000], multipleRange: [16, 19] },
  { name: 'San Antonio Spurs', league: 'nba', ebitdaRange: [60000, 78000], multipleRange: [16, 19] },

  // Tier 4 — Lower-value franchises
  { name: 'Minnesota Timberwolves', league: 'nba', ebitdaRange: [58000, 75000], multipleRange: [15, 18] },
  { name: 'Utah Jazz', league: 'nba', ebitdaRange: [58000, 72000], multipleRange: [15, 18] },
  { name: 'Charlotte Hornets', league: 'nba', ebitdaRange: [55000, 72000], multipleRange: [15, 18] },
  { name: 'Indiana Pacers', league: 'nba', ebitdaRange: [55000, 70000], multipleRange: [15, 18] },
  { name: 'Detroit Pistons', league: 'nba', ebitdaRange: [55000, 70000], multipleRange: [14, 18] },
  { name: 'Orlando Magic', league: 'nba', ebitdaRange: [52000, 68000], multipleRange: [14, 17] },
  { name: 'Oklahoma City Thunder', league: 'nba', ebitdaRange: [52000, 68000], multipleRange: [14, 17] },
  { name: 'New Orleans Pelicans', league: 'nba', ebitdaRange: [50000, 65000], multipleRange: [14, 17] },
  { name: 'Cleveland Cavaliers', league: 'nba', ebitdaRange: [50000, 65000], multipleRange: [14, 17] },
  { name: 'Memphis Grizzlies', league: 'nba', ebitdaRange: [50000, 65000], multipleRange: [14, 17] },

  // ============================================================
  // MLB — 30 teams
  // Tier: major | EBITDA: 30,000–100,000 | Multiples: 12–22x
  // ============================================================

  // Tier 1 — Elite franchises
  { name: 'New York Yankees', league: 'mlb', ebitdaRange: [85000, 100000], multipleRange: [19, 22] },
  { name: 'Los Angeles Dodgers', league: 'mlb', ebitdaRange: [82000, 98000], multipleRange: [19, 22] },
  { name: 'Boston Red Sox', league: 'mlb', ebitdaRange: [75000, 92000], multipleRange: [18, 22] },
  { name: 'Chicago Cubs', league: 'mlb', ebitdaRange: [72000, 88000], multipleRange: [18, 21] },
  { name: 'San Francisco Giants', league: 'mlb', ebitdaRange: [70000, 85000], multipleRange: [17, 21] },
  { name: 'New York Mets', league: 'mlb', ebitdaRange: [68000, 85000], multipleRange: [17, 21] },

  // Tier 2 — High-value franchises
  { name: 'St. Louis Cardinals', league: 'mlb', ebitdaRange: [62000, 78000], multipleRange: [16, 20] },
  { name: 'Houston Astros', league: 'mlb', ebitdaRange: [60000, 78000], multipleRange: [16, 20] },
  { name: 'Philadelphia Phillies', league: 'mlb', ebitdaRange: [58000, 75000], multipleRange: [16, 19] },
  { name: 'Atlanta Braves', league: 'mlb', ebitdaRange: [58000, 75000], multipleRange: [16, 19] },
  { name: 'Texas Rangers', league: 'mlb', ebitdaRange: [55000, 72000], multipleRange: [15, 19] },
  { name: 'Chicago White Sox', league: 'mlb', ebitdaRange: [52000, 68000], multipleRange: [15, 18] },

  // Tier 3 — Mid-value franchises
  { name: 'Washington Nationals', league: 'mlb', ebitdaRange: [50000, 65000], multipleRange: [15, 18] },
  { name: 'Los Angeles Angels', league: 'mlb', ebitdaRange: [50000, 65000], multipleRange: [15, 18] },
  { name: 'San Diego Padres', league: 'mlb', ebitdaRange: [48000, 62000], multipleRange: [14, 18] },
  { name: 'Seattle Mariners', league: 'mlb', ebitdaRange: [45000, 60000], multipleRange: [14, 17] },
  { name: 'Minnesota Twins', league: 'mlb', ebitdaRange: [45000, 58000], multipleRange: [14, 17] },
  { name: 'Detroit Tigers', league: 'mlb', ebitdaRange: [42000, 55000], multipleRange: [14, 17] },
  { name: 'Toronto Blue Jays', league: 'mlb', ebitdaRange: [42000, 58000], multipleRange: [14, 17] },
  { name: 'Arizona Diamondbacks', league: 'mlb', ebitdaRange: [40000, 55000], multipleRange: [13, 17] },

  // Tier 4 — Lower-value franchises
  { name: 'Colorado Rockies', league: 'mlb', ebitdaRange: [38000, 52000], multipleRange: [13, 16] },
  { name: 'Baltimore Orioles', league: 'mlb', ebitdaRange: [38000, 52000], multipleRange: [13, 16] },
  { name: 'Pittsburgh Pirates', league: 'mlb', ebitdaRange: [35000, 48000], multipleRange: [13, 16] },
  { name: 'Milwaukee Brewers', league: 'mlb', ebitdaRange: [35000, 48000], multipleRange: [13, 16] },
  { name: 'Cleveland Guardians', league: 'mlb', ebitdaRange: [35000, 48000], multipleRange: [12, 16] },
  { name: 'Cincinnati Reds', league: 'mlb', ebitdaRange: [33000, 45000], multipleRange: [12, 15] },
  { name: 'Kansas City Royals', league: 'mlb', ebitdaRange: [32000, 42000], multipleRange: [12, 15] },
  { name: 'Tampa Bay Rays', league: 'mlb', ebitdaRange: [30000, 42000], multipleRange: [12, 15] },
  { name: 'Miami Marlins', league: 'mlb', ebitdaRange: [30000, 40000], multipleRange: [12, 15] },
  { name: 'Oakland Athletics', league: 'mlb', ebitdaRange: [30000, 40000], multipleRange: [12, 15] },

  // ============================================================
  // NHL — 32 teams
  // Tier: growth | EBITDA: 15,000–50,000 | Multiples: 10–20x
  // ============================================================

  // Tier 1 — Elite franchises
  { name: 'New York Rangers', league: 'nhl', ebitdaRange: [40000, 50000], multipleRange: [17, 20] },
  { name: 'Toronto Maple Leafs', league: 'nhl', ebitdaRange: [40000, 50000], multipleRange: [17, 20] },
  { name: 'Montreal Canadiens', league: 'nhl', ebitdaRange: [38000, 48000], multipleRange: [17, 20] },
  { name: 'New York Islanders', league: 'nhl', ebitdaRange: [35000, 45000], multipleRange: [16, 19] },
  { name: 'Chicago Blackhawks', league: 'nhl', ebitdaRange: [35000, 45000], multipleRange: [16, 19] },
  { name: 'Boston Bruins', league: 'nhl', ebitdaRange: [34000, 44000], multipleRange: [16, 19] },
  { name: 'Los Angeles Kings', league: 'nhl', ebitdaRange: [33000, 43000], multipleRange: [15, 19] },
  { name: 'Philadelphia Flyers', league: 'nhl', ebitdaRange: [32000, 42000], multipleRange: [15, 18] },

  // Tier 2 — High-value franchises
  { name: 'Detroit Red Wings', league: 'nhl', ebitdaRange: [30000, 40000], multipleRange: [15, 18] },
  { name: 'Washington Capitals', league: 'nhl', ebitdaRange: [30000, 40000], multipleRange: [15, 18] },
  { name: 'Pittsburgh Penguins', league: 'nhl', ebitdaRange: [28000, 38000], multipleRange: [14, 18] },
  { name: 'Vancouver Canucks', league: 'nhl', ebitdaRange: [28000, 38000], multipleRange: [14, 18] },
  { name: 'Edmonton Oilers', league: 'nhl', ebitdaRange: [28000, 37000], multipleRange: [14, 17] },
  { name: 'Dallas Stars', league: 'nhl', ebitdaRange: [27000, 36000], multipleRange: [14, 17] },
  { name: 'Tampa Bay Lightning', league: 'nhl', ebitdaRange: [26000, 35000], multipleRange: [13, 17] },
  { name: 'Vegas Golden Knights', league: 'nhl', ebitdaRange: [26000, 35000], multipleRange: [13, 17] },

  // Tier 3 — Mid-value franchises
  { name: 'Colorado Avalanche', league: 'nhl', ebitdaRange: [25000, 34000], multipleRange: [13, 16] },
  { name: 'San Jose Sharks', league: 'nhl', ebitdaRange: [24000, 32000], multipleRange: [13, 16] },
  { name: 'Minnesota Wild', league: 'nhl', ebitdaRange: [23000, 32000], multipleRange: [12, 16] },
  { name: 'Seattle Kraken', league: 'nhl', ebitdaRange: [23000, 32000], multipleRange: [12, 16] },
  { name: 'St. Louis Blues', league: 'nhl', ebitdaRange: [22000, 30000], multipleRange: [12, 15] },
  { name: 'Nashville Predators', league: 'nhl', ebitdaRange: [22000, 30000], multipleRange: [12, 15] },
  { name: 'Calgary Flames', league: 'nhl', ebitdaRange: [22000, 30000], multipleRange: [12, 15] },
  { name: 'Carolina Hurricanes', league: 'nhl', ebitdaRange: [21000, 28000], multipleRange: [12, 15] },

  // Tier 4 — Lower-value franchises
  { name: 'New Jersey Devils', league: 'nhl', ebitdaRange: [20000, 28000], multipleRange: [11, 14] },
  { name: 'Winnipeg Jets', league: 'nhl', ebitdaRange: [20000, 27000], multipleRange: [11, 14] },
  { name: 'Anaheim Ducks', league: 'nhl', ebitdaRange: [19000, 26000], multipleRange: [11, 14] },
  { name: 'Ottawa Senators', league: 'nhl', ebitdaRange: [18000, 25000], multipleRange: [11, 14] },
  { name: 'Columbus Blue Jackets', league: 'nhl', ebitdaRange: [17000, 24000], multipleRange: [10, 13] },
  { name: 'Buffalo Sabres', league: 'nhl', ebitdaRange: [17000, 24000], multipleRange: [10, 13] },
  { name: 'Florida Panthers', league: 'nhl', ebitdaRange: [16000, 23000], multipleRange: [10, 13] },
  { name: 'Arizona Coyotes', league: 'nhl', ebitdaRange: [15000, 22000], multipleRange: [10, 13] },

  // ============================================================
  // EPL — 20 teams (2024-25 season)
  // Tier: major | EBITDA: 40,000–120,000 | Multiples: 14–25x
  // ============================================================

  // Tier 1 — Elite franchises
  { name: 'Manchester United', league: 'epl', ebitdaRange: [100000, 120000], multipleRange: [22, 25] },
  { name: 'Manchester City', league: 'epl', ebitdaRange: [100000, 120000], multipleRange: [22, 25] },
  { name: 'Liverpool', league: 'epl', ebitdaRange: [95000, 115000], multipleRange: [21, 25] },
  { name: 'Arsenal', league: 'epl', ebitdaRange: [90000, 110000], multipleRange: [20, 24] },
  { name: 'Chelsea', league: 'epl', ebitdaRange: [85000, 108000], multipleRange: [20, 24] },

  // Tier 2 — High-value franchises
  { name: 'Tottenham Hotspur', league: 'epl', ebitdaRange: [78000, 95000], multipleRange: [18, 22] },
  { name: 'Newcastle United', league: 'epl', ebitdaRange: [72000, 90000], multipleRange: [18, 22] },
  { name: 'West Ham United', league: 'epl', ebitdaRange: [65000, 82000], multipleRange: [17, 20] },
  { name: 'Aston Villa', league: 'epl', ebitdaRange: [62000, 78000], multipleRange: [17, 20] },
  { name: 'Brighton & Hove Albion', league: 'epl', ebitdaRange: [58000, 75000], multipleRange: [16, 20] },

  // Tier 3 — Mid-value franchises
  { name: 'Everton', league: 'epl', ebitdaRange: [55000, 70000], multipleRange: [16, 19] },
  { name: 'Fulham', league: 'epl', ebitdaRange: [52000, 68000], multipleRange: [15, 18] },
  { name: 'Crystal Palace', league: 'epl', ebitdaRange: [50000, 65000], multipleRange: [15, 18] },
  { name: 'Wolverhampton Wanderers', league: 'epl', ebitdaRange: [48000, 62000], multipleRange: [15, 18] },
  { name: 'Brentford', league: 'epl', ebitdaRange: [48000, 62000], multipleRange: [15, 18] },

  // Tier 4 — Lower-value franchises
  { name: 'Nottingham Forest', league: 'epl', ebitdaRange: [45000, 58000], multipleRange: [14, 17] },
  { name: 'Bournemouth', league: 'epl', ebitdaRange: [44000, 56000], multipleRange: [14, 17] },
  { name: 'Leicester City', league: 'epl', ebitdaRange: [42000, 55000], multipleRange: [14, 17] },
  { name: 'Ipswich Town', league: 'epl', ebitdaRange: [40000, 52000], multipleRange: [14, 16] },
  { name: 'Southampton', league: 'epl', ebitdaRange: [40000, 50000], multipleRange: [14, 16] },

  // ============================================================
  // MLS — 29 teams (2025 season, includes San Diego FC)
  // Tier: growth | EBITDA: 15,000–40,000 | Multiples: 10–18x
  // ============================================================

  // Tier 1 — Elite franchises
  { name: 'LAFC', league: 'mls', ebitdaRange: [30000, 40000], multipleRange: [15, 18] },
  { name: 'Atlanta United FC', league: 'mls', ebitdaRange: [30000, 38000], multipleRange: [15, 18] },
  { name: 'LA Galaxy', league: 'mls', ebitdaRange: [28000, 38000], multipleRange: [14, 18] },
  { name: 'Seattle Sounders FC', league: 'mls', ebitdaRange: [28000, 36000], multipleRange: [14, 17] },
  { name: 'Inter Miami CF', league: 'mls', ebitdaRange: [28000, 38000], multipleRange: [15, 18] },
  { name: 'Portland Timbers', league: 'mls', ebitdaRange: [26000, 34000], multipleRange: [14, 17] },
  { name: 'Toronto FC', league: 'mls', ebitdaRange: [25000, 34000], multipleRange: [13, 17] },

  // Tier 2 — High-value franchises
  { name: 'New York City FC', league: 'mls', ebitdaRange: [24000, 32000], multipleRange: [13, 16] },
  { name: 'New York Red Bulls', league: 'mls', ebitdaRange: [24000, 32000], multipleRange: [13, 16] },
  { name: 'Philadelphia Union', league: 'mls', ebitdaRange: [22000, 30000], multipleRange: [12, 16] },
  { name: 'Austin FC', league: 'mls', ebitdaRange: [22000, 30000], multipleRange: [12, 16] },
  { name: 'Charlotte FC', league: 'mls', ebitdaRange: [22000, 30000], multipleRange: [12, 16] },
  { name: 'Columbus Crew', league: 'mls', ebitdaRange: [21000, 28000], multipleRange: [12, 15] },
  { name: 'Sporting Kansas City', league: 'mls', ebitdaRange: [20000, 28000], multipleRange: [12, 15] },

  // Tier 3 — Mid-value franchises
  { name: 'Minnesota United FC', league: 'mls', ebitdaRange: [20000, 27000], multipleRange: [11, 15] },
  { name: 'Real Salt Lake', league: 'mls', ebitdaRange: [19000, 26000], multipleRange: [11, 14] },
  { name: 'D.C. United', league: 'mls', ebitdaRange: [19000, 26000], multipleRange: [11, 14] },
  { name: 'CF Montr\u00e9al', league: 'mls', ebitdaRange: [18000, 25000], multipleRange: [11, 14] },
  { name: 'FC Dallas', league: 'mls', ebitdaRange: [18000, 25000], multipleRange: [11, 14] },
  { name: 'Orlando City SC', league: 'mls', ebitdaRange: [18000, 25000], multipleRange: [11, 14] },
  { name: 'Houston Dynamo FC', league: 'mls', ebitdaRange: [18000, 25000], multipleRange: [11, 14] },
  { name: 'San Diego FC', league: 'mls', ebitdaRange: [18000, 26000], multipleRange: [11, 15] },

  // Tier 4 — Lower-value franchises
  { name: 'St. Louis City SC', league: 'mls', ebitdaRange: [17000, 24000], multipleRange: [10, 14] },
  { name: 'New England Revolution', league: 'mls', ebitdaRange: [17000, 24000], multipleRange: [10, 13] },
  { name: 'Vancouver Whitecaps FC', league: 'mls', ebitdaRange: [16000, 23000], multipleRange: [10, 13] },
  { name: 'FC Cincinnati', league: 'mls', ebitdaRange: [16000, 23000], multipleRange: [10, 13] },
  { name: 'Colorado Rapids', league: 'mls', ebitdaRange: [15000, 22000], multipleRange: [10, 13] },
  { name: 'Nashville SC', league: 'mls', ebitdaRange: [15000, 22000], multipleRange: [10, 13] },
  { name: 'Chicago Fire FC', league: 'mls', ebitdaRange: [15000, 22000], multipleRange: [10, 13] },

  // ============================================================
  // WNBA — 13 teams (includes Golden State Valkyries for 2025)
  // Tier: women | EBITDA: 5,000–25,000 | Multiples: 12–20x
  // Valuations: ~$60M–$500M (hundreds of millions range)
  // ============================================================

  // Tier 1 — Elite franchises
  { name: 'New York Liberty', league: 'wnba', ebitdaRange: [20000, 25000], multipleRange: [18, 20] },
  { name: 'Las Vegas Aces', league: 'wnba', ebitdaRange: [18000, 23000], multipleRange: [17, 20] },
  { name: 'Los Angeles Sparks', league: 'wnba', ebitdaRange: [15000, 20000], multipleRange: [16, 19] },
  { name: 'Golden State Valkyries', league: 'wnba', ebitdaRange: [15000, 20000], multipleRange: [16, 19] },

  // Tier 2 — Mid-value franchises
  { name: 'Seattle Storm', league: 'wnba', ebitdaRange: [12000, 17000], multipleRange: [15, 18] },
  { name: 'Connecticut Sun', league: 'wnba', ebitdaRange: [10000, 15000], multipleRange: [14, 17] },
  { name: 'Minnesota Lynx', league: 'wnba', ebitdaRange: [10000, 15000], multipleRange: [14, 17] },
  { name: 'Phoenix Mercury', league: 'wnba', ebitdaRange: [9000, 14000], multipleRange: [13, 16] },
  { name: 'Chicago Sky', league: 'wnba', ebitdaRange: [8000, 13000], multipleRange: [13, 16] },

  // Tier 3 — Lower-value franchises
  { name: 'Washington Mystics', league: 'wnba', ebitdaRange: [7000, 11000], multipleRange: [12, 15] },
  { name: 'Indiana Fever', league: 'wnba', ebitdaRange: [7000, 11000], multipleRange: [12, 15] },
  { name: 'Dallas Wings', league: 'wnba', ebitdaRange: [6000, 9000], multipleRange: [12, 14] },
  { name: 'Atlanta Dream', league: 'wnba', ebitdaRange: [5000, 8000], multipleRange: [12, 14] },

  // ============================================================
  // NWSL — 14 teams (2025 season)
  // Tier: women | EBITDA: 3,000–18,000 | Multiples: 10–18x
  // Valuations: ~$30M–$324M (hundreds of millions range)
  // ============================================================

  // Tier 1 — Elite franchises
  { name: 'Angel City FC', league: 'nwsl', ebitdaRange: [14000, 18000], multipleRange: [15, 18] },
  { name: 'San Diego Wave FC', league: 'nwsl', ebitdaRange: [12000, 16000], multipleRange: [14, 17] },
  { name: 'Portland Thorns FC', league: 'nwsl', ebitdaRange: [12000, 16000], multipleRange: [14, 17] },
  { name: 'NJ/NY Gotham FC', league: 'nwsl', ebitdaRange: [10000, 14000], multipleRange: [13, 16] },

  // Tier 2 — Mid-value franchises
  { name: 'Washington Spirit', league: 'nwsl', ebitdaRange: [8000, 12000], multipleRange: [13, 16] },
  { name: 'Chicago Red Stars', league: 'nwsl', ebitdaRange: [7000, 11000], multipleRange: [12, 15] },
  { name: 'Orlando Pride', league: 'nwsl', ebitdaRange: [7000, 11000], multipleRange: [12, 15] },
  { name: 'North Carolina Courage', league: 'nwsl', ebitdaRange: [6000, 10000], multipleRange: [11, 14] },
  { name: 'Kansas City Current', league: 'nwsl', ebitdaRange: [6000, 10000], multipleRange: [11, 14] },
  { name: 'Houston Dash', league: 'nwsl', ebitdaRange: [5000, 8000], multipleRange: [11, 13] },

  // Tier 3 — Lower-value franchises
  { name: 'Seattle Reign FC', league: 'nwsl', ebitdaRange: [4500, 7000], multipleRange: [10, 13] },
  { name: 'Bay FC', league: 'nwsl', ebitdaRange: [4500, 7000], multipleRange: [10, 13] },
  { name: 'Utah Royals FC', league: 'nwsl', ebitdaRange: [3500, 5500], multipleRange: [10, 12] },
  { name: 'Racing Louisville FC', league: 'nwsl', ebitdaRange: [3000, 5000], multipleRange: [10, 12] },
];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export function getTeamsByLeague(league: ProSportsLeague): ProSportsTeam[] {
  return PRO_SPORTS_TEAMS.filter(t => t.league === league);
}

export function getLeagueTier(league: ProSportsLeague): LeagueConfig['tier'] {
  return LEAGUE_CONFIGS[league].tier;
}
