export type Confidence = 'reported' | 'assumed' | 'invented';
export interface Assumption { topic: string; value: string; confidence: Confidence; source: string }

export const CATEGORIES = [
  { id: 'A', name: 'Normal supply', target: 0, confidence: 'reported', note: 'No restrictions. The City reported Category A in April 2026. Status changes, so check the current one.' },
  { id: 'B', name: 'Supply alert', target: 0.05, confidence: 'assumed', note: 'The Category B saving target was not verified. 5% is an assumption.' },
  { id: 'C', name: 'Water scarcity', target: 0.1, confidence: 'reported', note: 'Mandatory 10% saving target, as reported by news citing the City water demand management plan.' },
  { id: 'D', name: 'Severe water scarcity', target: 0.15, confidence: 'reported', note: 'Mandatory 15% saving target with penalty tariffs, as reported. The City revoked Category D in August 2025.' },
  { id: 'E', name: 'Critical', target: 0.2, confidence: 'reported', note: 'A 2018 report says Category E required 20% savings. Check the current plan.' },
];

export const ASSUMPTIONS: Assumption[] = [
  { topic: 'Network layout, pipes, materials, diameters, conditions', value: 'Illustrative network around Windhoek', confidence: 'invented', source: 'Invented for this prototype. Not City of Windhoek or NamWater asset data.' },
  { topic: 'Scarcity saving targets C, D, E', value: '10%, 15%, 20%', confidence: 'reported', source: 'News reports citing the City water demand management plan (Namibian Sun 2018, New Era, NBC). Confirm against the plan.' },
  { topic: 'Scarcity saving target B', value: '5%', confidence: 'assumed', source: 'Not verified.' },
  { topic: 'Resident compliance with the target', value: '50% default', confidence: 'assumed', source: 'Real consumption has often exceeded targets (for example 16% above target in a week of May 2024), so full compliance is unrealistic.' },
  { topic: 'Target system pressure', value: '65 PSI', confidence: 'assumed', source: 'Project specification.' },
  { topic: 'Target demand', value: '800 GPM', confidence: 'assumed', source: 'Project specification.' },
  { topic: 'Pipe condition classes', value: 'Good 75+, Fair 50-74, Poor 20-49, Critical <20', confidence: 'assumed', source: 'Project specification.' },
  { topic: 'Pipe break chance below 20% condition', value: 'Random, rises as condition falls', confidence: 'assumed', source: 'Simplified rule.' },
  { topic: 'Friction coefficients (Hazen-Williams C)', value: 'Ductile iron 130, PVC 150, HDPE 150', confidence: 'assumed', source: 'Typical textbook values.' },
  { topic: 'Pressure surge alert', value: 'Rise of 40 PSI or more in one step', confidence: 'assumed', source: 'Simplified rule. The model does not simulate water hammer.' },
  { topic: 'Escalation timing', value: 'Email 5 min, call 10 min (demo 20 s and 40 s)', confidence: 'assumed', source: 'Project specification.' },
  { topic: 'Weather risk thresholds (rail)', value: 'Rain 10/25 mm per day, heat 35/40 C', confidence: 'assumed', source: 'Simplified rules. Weather data itself is real: NASA POWER and Open-Meteo.' },
];