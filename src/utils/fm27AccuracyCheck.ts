/**
 * Lightweight FM27 Patch 27.1.0 accuracy guard with zero JSON catalog imports.
 * Used by AutoSyncWorkspace for instant chat-turn fact-checking without pulling
 * fm27KnowledgeBase.ts and fm27Roles.json into the cold-start bundle.
 */

export const RETIRED_FM24_ROLES = [
  'Mezzala',
  'Enganche',
  'Trequartista',
  'Carrilero',
  'Raumdeuter',
  'Segundo Volante',
  'Inverted Wing-Back (Attack)',
  'Complete Wing-Back',
  'Roam From Position',
] as const;

export const RETIRED_FM24_DUTY_PATTERNS: RegExp[] = [
  /\b(Defend|Support|Attack)\s+duty\b/i,
  /\((Defend|Support|Attack)\)/i,
  /\b(CB|FB|WB|DM|CM|AM|IW|IF|AF|PF|W)\s*-\s*(De|Su|At)\b/,
];

export const RAW_CA_PA_LEAK_PATTERNS: RegExp[] = [
  /\bCA\s*[:=]?\s*\d{2,3}\b/i,
  /\bPA\s*[:=]?\s*\d{2,3}\b/i,
  /\bCA\s*\d{2,3}\s*\/\s*PA\s*\d{2,3}\b/i,
];

export interface Fm27ResponseWarningCheck {
  passed: boolean;
  warnings: string[];
}

export function checkFm27ResponseWarnings(text: string): Fm27ResponseWarningCheck {
  const safeText = text || '';
  const warnings: string[] = [];

  for (const retired of RETIRED_FM24_ROLES) {
    const regex = new RegExp(`\\b${retired.replace(/[()]/g, '\\$&')}\\b`, 'i');
    if (regex.test(safeText)) {
      warnings.push(
        `Mentioned retired FM24 role "${retired}" — use an authentic FM27 IP/OOP role instead.`
      );
    }
  }

  for (const dutyPattern of RETIRED_FM24_DUTY_PATTERNS) {
    const m = safeText.match(dutyPattern);
    if (m) {
      warnings.push(
        `Mentioned legacy FM24 duty syntax ("${m[0]}") — FM27 uses separate IP and OOP roles.`
      );
      break;
    }
  }

  for (const caPaPattern of RAW_CA_PA_LEAK_PATTERNS) {
    if (caPaPattern.test(safeText)) {
      warnings.push(
        'Detected raw numeric CA/PA reference — display relative Star Ratings and FM27 Engine Metrics only.'
      );
      break;
    }
  }

  return {
    passed: warnings.length === 0,
    warnings,
  };
}
