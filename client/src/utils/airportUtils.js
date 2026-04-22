const SEASON_LABELS = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
  all: 'All Seasons',
};

export const getSeasonLabel = (season) => SEASON_LABELS[season] || season;

export const getRiskScoreColor = (score) => {
  if (score >= 0.75) return '#dc2626';
  if (score >= 0.5) return '#ea580c';
  if (score >= 0.25) return '#ca8a04';
  return '#16a34a';
};
