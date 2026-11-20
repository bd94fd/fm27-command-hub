import {
  Activity,
  BookOpen,
  Building2,
  Calendar,
  ClipboardList,
  CloudUpload,
  LayoutDashboard,
  Shield,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { WorkspaceTabId } from '../domain/types';

export interface WorkspaceNavItem {
  id: WorkspaceTabId;
  label: string;
  section: 'Command Centre' | 'Squad & Tactics' | 'World & Scouting' | 'Reference';
  description: string;
  icon: ComponentType<{ className?: string }>;
  hasFilter: boolean;
}

export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    section: 'Command Centre',
    description: 'Executive club status, live save proof, league standing, and next fixture readiness.',
    icon: LayoutDashboard,
    hasFilter: false,
  },
  {
    id: 'ai',
    label: 'AI Assistant',
    section: 'Command Centre',
    description: 'Grounded FM27 tactical co-pilot, slash commands, and squad/shortlist planning.',
    icon: Sparkles,
    hasFilter: false,
  },
  {
    id: 'sync',
    label: 'Auto-Sync & Google',
    section: 'Command Centre',
    description: 'Drop .fm saves, screenshots, or CSV/HTML/RTF exports to update the hub & Google Workspace.',
    icon: CloudUpload,
    hasFilter: false,
  },
  {
    id: 'players',
    label: 'Squad & Players',
    section: 'Squad & Tactics',
    description: 'Scouting grid, 59 attributes, Patch 27.1.0 speed/jump physics, and per-90 analytics.',
    icon: Users,
    hasFilter: true,
  },
  {
    id: 'tactics',
    label: 'Tactics & Load',
    section: 'Squad & Tactics',
    description: 'Dual-phase IP/OOP tactical slots and Double-Gameweek 180-minute load guardrails.',
    icon: Shield,
    hasFilter: false,
  },
  {
    id: 'matches',
    label: 'Match Log',
    section: 'Squad & Tactics',
    description: 'Table 1G chronological match archive, competitive record, xG, and tactical audits.',
    icon: Activity,
    hasFilter: false,
  },
  {
    id: 'staff',
    label: 'Staff',
    section: 'World & Scouting',
    description: 'Backroom staff directory with exact FM27 9-role coaching star ratings.',
    icon: UserCheck,
    hasFilter: true,
  },
  {
    id: 'clubs',
    label: 'Clubs',
    section: 'World & Scouting',
    description: 'Explore clubs, finances, debts, facilities, and continental coefficients.',
    icon: Building2,
    hasFilter: true,
  },
  {
    id: 'competitions',
    label: 'Competitions',
    section: 'World & Scouting',
    description: 'Browse competitions and reputation tiers in your loaded save world.',
    icon: Trophy,
    hasFilter: true,
  },
  {
    id: 'fixtures',
    label: 'Fixtures',
    section: 'World & Scouting',
    description: 'Upcoming and played schedule with one-click AI opposition scouting.',
    icon: Calendar,
    hasFilter: false,
  },
  {
    id: 'recruitment',
    label: 'Recruitment',
    section: 'World & Scouting',
    description: 'Track transfer targets, agent interest, deal stages, and AI/manager shortlists.',
    icon: ClipboardList,
    hasFilter: false,
  },
  {
    id: 'playbook',
    label: 'Playbook v2.0',
    section: 'Reference',
    description: 'Bobby Dean Portable FM27 Playbook v2.0 + interactive 68 IP/OOP roles explorer.',
    icon: BookOpen,
    hasFilter: false,
  },
];

const NAV_SECTIONS: WorkspaceNavItem['section'][] = [
  'Command Centre',
  'Squad & Tactics',
  'World & Scouting',
  'Reference',
];

interface SidebarNavProps {
  activeTab: WorkspaceTabId;
  onSelectTab: (tab: WorkspaceTabId) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function SidebarNav({
  activeTab,
  onSelectTab,
  mobileOpen = false,
  onCloseMobile,
}: SidebarNavProps) {
  function handlePick(tab: WorkspaceTabId) {
    onSelectTab(tab);
    onCloseMobile?.();
  }

  const navContent = (
    <div className="flex h-full flex-col overflow-y-auto px-2.5 py-4 select-none">
      {NAV_SECTIONS.map((section) => {
        const items = WORKSPACE_NAV_ITEMS.filter((item) => item.section === section);
        return (
          <div key={section} className="mb-4 last:mb-0">
            <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#a698ac]">
              {section}
            </div>
            <nav aria-label={section} className="flex flex-col gap-1">
              {items.map((item) => {
                const Icon = item.icon;
                const isSelected = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handlePick(item.id)}
                    aria-current={isSelected ? 'page' : undefined}
                    className={`flex min-h-[38px] w-full items-center gap-2.5 rounded-[4px] border px-3 text-left text-[12.5px] font-semibold transition-colors cursor-pointer ${
                      isSelected
                        ? 'fm-tab-active'
                        : 'border-transparent text-[#c6bdce] hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    <Icon
                      className={`h-[16px] w-[16px] shrink-0 ${
                        isSelected ? 'text-[#e5adff]' : 'text-[#9c8ba9]'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        );
      })}

      <div className="mt-auto flex flex-col gap-1 px-3 pt-4 border-t border-white/[0.06]">
        <div className="fm-font-display text-[20px] font-black italic tracking-[-1px] text-[#8c7798]">
          FM27
        </div>
        <p className="text-[10.5px] leading-relaxed text-[#a295ac]">
          Zero-mock local save hub · Patch 27.1.0
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="fm-sidebar-bg hidden lg:flex w-[216px] shrink-0 flex-col border-r border-[#2d2534]">
        {navContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-[2px]"
            onClick={onCloseMobile}
          />
          <aside className="fm-sidebar-bg relative z-10 flex h-full w-[250px] flex-col border-r border-[#39333f] shadow-2xl">
            <div className="flex h-[54px] items-center justify-between border-b border-[#2d2534] px-4">
              <span className="fm-font-display text-[17px] font-bold text-white">
                Workspace
              </span>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close navigation"
                className="rounded p-1 text-[#b2acbb] hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{navContent}</div>
          </aside>
        </div>
      )}
    </>
  );
}
