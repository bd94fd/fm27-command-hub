import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOC_PATH = 'docs/data-parity-contract-map.md';
const read = (relPath: string) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

interface SelectorProbe {
  label: string;
  uiFile: string;
  uiSelectors: string[];
  analystFile: string;
  analystSelectors: string[];
}

/**
 * These are the selectors the map promises are shared. A failure here means one side
 * stopped using the shared calculation and is at risk of formatting or filtering it
 * differently from the other side.
 */
const SELECTOR_PROBES: SelectorProbe[] = [
  {
    label: 'Weekly wage',
    uiFile: 'src/components/PlayerDetailModal.tsx',
    uiSelectors: ['formatWeeklyWage'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['formatWeeklyWage'],
  },
  {
    label: 'Contract expiry',
    uiFile: 'src/components/PlayerDetailModal.tsx',
    uiSelectors: ['formatContractExpiry'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['formatContractExpiry'],
  },
  {
    label: 'Age and nationality',
    uiFile: 'src/components/PlayerDetailModal.tsx',
    uiSelectors: ['formatAge', 'formatNation'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['formatAge'],
  },
  {
    label: 'Apps, minutes, average rating',
    uiFile: 'src/utils/squadViewHelpers.ts',
    uiSelectors: ['hasPlayerMatchStats'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['hasPlayerMatchStats'],
  },
  {
    label: 'Squad pool counts',
    uiFile: 'src/components/AutoSyncWorkspace.tsx',
    uiSelectors: ['describeSquadPool'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['describeSquadPool'],
  },
  {
    label: 'League position, record, points',
    uiFile: 'src/hooks/useCampaignSummaries.ts',
    uiSelectors: ['computeCompetitiveSummary'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['computeCompetitiveSummary'],
  },
  {
    label: 'Competition and season scope',
    uiFile: 'src/components/MatchLogArchive.tsx',
    uiSelectors: ['classifyMatchEntryBucket'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['classifyMatchCompetitionBucket'],
  },
  {
    label: 'Best Fit % and role suitability',
    uiFile: 'src/components/PlayerDetailModal.tsx',
    uiSelectors: ['analyzePlayerCard'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['analyzePlayerCard'],
  },
  {
    label: 'Meta current and potential score',
    uiFile: 'src/components/PlayerDetailModal.tsx',
    uiSelectors: ['evaluatePlayerMetaScore'],
    analystFile: 'src/utils/fmfShortlistExporter.ts',
    analystSelectors: ['evaluatePlayerMetaScore'],
  },
  {
    label: 'Transfer verdict and action plan',
    uiFile: 'src/components/RecruitmentWorkspace.tsx',
    uiSelectors: ['buildSquadTransferAudit'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['buildSquadTransferAudit'],
  },
  {
    label: 'Set-piece specialist rankings',
    uiFile: 'src/components/SetPiecesAndTraining.tsx',
    uiSelectors: ['buildDynamicSetPieceRoutines'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['buildDynamicSetPieceRoutines'],
  },
  {
    label: 'Last-match blueprint',
    uiFile: 'src/components/LastMatchTacticBlueprintCard.tsx',
    uiSelectors: ['buildLastMatchTacticBlueprint'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['buildLastMatchTacticBlueprint'],
  },
  {
    label: 'Manager contract and job security',
    uiFile: 'src/hooks/useLiveGovernance.ts',
    uiSelectors: ['buildClubGovernanceState'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['buildClubGovernanceState'],
  },
  {
    label: 'Squad planner depth',
    uiFile: 'src/components/charts/SquadScatterAndPlannerCharts.tsx',
    uiSelectors: ['resolveSquadPlannerSlotMeta'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['resolveSquadPlannerSlotMeta'],
  },
  {
    label: 'Job Centre vacancies',
    uiFile: 'src/components/StaffDirectory.tsx',
    uiSelectors: ['normalizeJobVacancy'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['normalizeJobVacancy'],
  },
  {
    label: 'Contract expiry',
    uiFile: 'src/components/StaffDirectory.tsx',
    uiSelectors: ['isStaffContractExpiringSoon'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['isStaffContractExpiringSoon'],
  },
  {
    label: 'Department and headline rating',
    uiFile: 'src/components/StaffDirectory.tsx',
    uiSelectors: ['getStaffHeadlineDisplay'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['getStaffHeadlineDisplay'],
  },
  {
    label: 'Unified training and department matrix',
    uiFile: 'src/components/StaffDirectory.tsx',
    uiSelectors: ['buildUnifiedStaffMatrix'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['buildUnifiedStaffMatrix'],
  },
  {
    label: 'Preferred Job Affinity ratings',
    uiFile: 'src/components/StaffDetailModal.tsx',
    uiSelectors: ['PREFERRED_JOB_AFFINITY_CAPTION'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['PREFERRED_JOB_AFFINITY_CAPTION'],
  },
  {
    label: 'Weekly staff payroll',
    uiFile: 'src/components/StaffDirectory.tsx',
    uiSelectors: ['computeStaffKpiSummary'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['formatWeeklyStaffPayroll'],
  },
  {
    label: 'Player Wage Bill (canonical)',
    uiFile: 'src/components/AutoSyncWorkspace.tsx',
    uiSelectors: ['buildFinancesPanelFromSave'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['wageComplianceLabel'],
  },
  {
    label: 'Sponsorship deals',
    uiFile: 'src/components/AutoSyncWorkspace.tsx',
    uiSelectors: ['filterUsableSponsorshipDeals'],
    analystFile: 'src/utils/tacticalAnalystContext.ts',
    analystSelectors: ['buildSponsorshipPanelRows'],
  },
];

function hasAnySelector(source: string, selectors: string[]): boolean {
  return selectors.some((selector) => source.includes(selector));
}

describe('data parity contract map', () => {
  it('exists and names every shared selector and core section', () => {
    const doc = read(DOC_PATH);

    for (const heading of [
      '# FM27 data parity contract map',
      'Roadmap: R04',
      '## How to read the table',
      '## The contract',
      '## Shared selectors the test enforces',
      '## Known gaps',
      '## Deliberate omissions',
      '## Changing a field',
      '## Verification',
    ]) {
      assert.ok(doc.includes(heading), `contract map is missing ${heading}`);
    }

    for (const probe of SELECTOR_PROBES) {
      assert.ok(doc.includes(probe.label), `contract map is missing the row ${probe.label}`);
      for (const selector of [...probe.uiSelectors, ...probe.analystSelectors]) {
        assert.ok(
          doc.includes(selector),
          `contract map is missing the selector ${selector} for ${probe.label}`
        );
      }
    }
  });

  it('keeps every shared selector in use on both sides', () => {
    for (const probe of SELECTOR_PROBES) {
      const uiSource = read(probe.uiFile);
      const analystSource = read(probe.analystFile);

      assert.ok(
        hasAnySelector(uiSource, probe.uiSelectors),
        `${probe.label}: ${probe.uiFile} no longer uses ${probe.uiSelectors.join(' or ')}`
      );
      assert.ok(
        hasAnySelector(analystSource, probe.analystSelectors),
        `${probe.label}: ${probe.analystFile} no longer uses ${probe.analystSelectors.join(' or ')}`
      );
    }
  });

  it('keeps one numbered contract row per value with no gaps or duplicates', () => {
    const doc = read(DOC_PATH);
    const contractSection = doc.split('## Shared selectors the test enforces')[0];
    const rows = contractSection
      .split('\n')
      .filter((line) => /^\| \d+ \|/.test(line));

    assert.ok(rows.length >= 85, `expected at least 85 contract rows, found ${rows.length}`);

    const ids = rows.map((line) => Number(line.split('|')[1].trim()));
    assert.equal(new Set(ids).size, ids.length, 'contract row numbers must be unique');
    for (let index = 1; index < ids.length; index += 1) {
      assert.equal(
        ids[index],
        ids[index - 1] + 1,
        `contract row numbers must run in order; ${ids[index - 1]} is followed by ${ids[index]}`
      );
    }
  });

  it('links the contract map from the roadmap and records R04 as done', () => {
    const roadmap = read('ROADMAP.md');

    assert.match(roadmap, /R04 Data parity contract map/);
    assert.ok(roadmap.includes('docs/data-parity-contract-map.md'));
    assert.match(roadmap, /R04 Data parity contract map: Done/);
  });
});
