import type { PlaybookArchetypeMatch } from '../../utils/recruitmentHelpers';
import type { TransferActionVerdict } from '../../utils/transferAudit';

export function archetypeBadgeClass(tone: PlaybookArchetypeMatch['badgeTone']): string {
  switch (tone) {
    case 'rose':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/35';
    case 'sky':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/35';
    case 'emerald':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
    case 'amber':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
    case 'indigo':
      return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/35';
    case 'purple':
      return 'bg-purple-500/15 text-purple-300 border-purple-500/35';
  }
}

export function verdictBadgeClass(verdict: TransferActionVerdict): string {
  switch (verdict) {
    case 'Protect Youth Asset':
      return 'bg-purple-500/15 text-purple-300 border-purple-500/40';
    case 'Renew Now':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
    case 'Sell / Transfer List':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/40';
    case 'Replace Before Selling':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/40';
    case 'Let Expire':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
    case 'Loan Out':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/40';
    case 'Hold':
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
}
