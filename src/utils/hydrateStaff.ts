import type { StaffRecord } from '../types/fm27';
import { clampAttributeValue } from '../types/fmSave';
import type { DecodedFmSavePayload } from './fmSaveHydrator';
import { MISSING_VALUE } from './squadViewHelpers';

/**
 * Turns the save's staff rows into directory records, filling unknown attribute
 * groups with a neutral 10 rather than inventing a rating.
 */
export function hydrateStaff(decoded: DecodedFmSavePayload): StaffRecord[] {
  return (decoded.staff || []).map((s, idx) => ({
    id: `fm-staff-${s.uid || idx}`,
    uid: s.uid,
    name: s.name?.trim() || MISSING_VALUE,
    role: s.role?.trim() || MISSING_VALUE,
    age:
      s.age !== null &&
      s.age !== undefined &&
      Number.isFinite(Number(s.age)) &&
      Number(s.age) > 0
        ? Number(s.age)
        : NaN,
    nation: s.nation?.trim() || MISSING_VALUE,
    club: s.club || decoded.meta.clubName || '',
    wagePw:
      typeof s.wagePw === 'number' && Number.isFinite(s.wagePw) ? s.wagePw : null,
    expires: s.expires?.trim() || MISSING_VALUE,
    secondaryJob: s.secondaryJob ?? null,
    jobRatings: s.jobRatings ?? null,
    attributes: s.attributes || {
      attacking: clampAttributeValue(s.coachingAttacking ?? 10),
      defending: clampAttributeValue(s.coachingDefending ?? 10),
      fitness: 10,
      goalkeeping: 10,
      mental: 10,
      possession: 10,
      set_pieces: 10,
      tactical: clampAttributeValue(s.coachingTactical ?? 10),
      technical: 10,
      working_with_youngsters: 10,
      adaptability: 10,
      authority: 10,
      determination: 10,
      judging_player_ability: clampAttributeValue(s.judgingAbility ?? 10),
      judging_player_potential: clampAttributeValue(s.judgingPotential ?? 10),
      judging_staff_ability: 10,
      man_management: 10,
      motivating: 10,
      negotiating: 10,
      physiotherapy: 10,
      sports_science: 10,
      tactical_knowledge: 10,
      analysing_data: 10,
    },
  }));
}
