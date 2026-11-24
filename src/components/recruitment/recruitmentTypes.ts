import type { EnrichedRecruitmentTarget } from '../../utils/recruitmentHelpers';
import type { ClubDnaEvaluationResult } from '../../utils/clubDnaEngine';
import type { SquadTransferAuditSummary } from '../../utils/transferAudit';
import type { PlayerRecord } from '../../types/fm27';
import type { RecruitmentTarget } from '../../types/fmSave';
import type { TargetVsStarterComparison } from '../../utils/recruitmentHelpers';

export type SquadAudit = SquadTransferAuditSummary;
export type PlayerAdviceItem = SquadAudit['playerAdvice'][number];
export type PositionalNeed = SquadAudit['positionalNeeds'][number];

export type AuditView = 'advice' | 'loans' | 'contracts' | 'depth' | 'targets' | 'shortlist';

export type ContractHorizonTier =
  | 'ALL'
  | 'CRITICAL_6M'
  | 'WARNING_12M'
  | 'WATCH_18M'
  | 'SECURE_18M_PLUS';

export type TargetSortKey =
  | 'GAP_FIT'
  | 'CLUB_DNA'
  | 'ROLE_FIT'
  | 'ARCHETYPE'
  | 'AGE'
  | 'WAGE';

export interface RegistrationCheck {
  u21Count: number;
  countableSenior: number;
  overLimit: boolean;
}

export interface ContractHorizonSummary {
  critical6m: PlayerAdviceItem[];
  warning12m: PlayerAdviceItem[];
  watch18m: PlayerAdviceItem[];
  secure18mPlus: PlayerAdviceItem[];
  wageAtRisk12m: number;
  keyAssetsAtRisk: PlayerAdviceItem[];
  projectedWageFreed: number;
  activeList: PlayerAdviceItem[];
}

export type EnrichedScoutTargetWithDna = EnrichedRecruitmentTarget & {
  dna: ClubDnaEvaluationResult;
};

export interface ActiveComparison {
  target: RecruitmentTarget;
  starter: PlayerRecord | null;
  comparison: TargetVsStarterComparison | null;
}
