/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Briefcase,
  Command,
  Crosshair,
  MessageSquare,
  Search,
  Shield,
  Trophy,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { PlayerRecord, StaffRecord } from '../types/fm27';
import { RecruitmentTarget } from '../types/fmSave';
import {
  FORMATION_PRESETS,
  FormationPresetKey,
} from '../utils/bestXiSolver';
import { MobileSheetFrame } from './MobileSheetFrame';

export type CommandTabId =
  | 'sync'
  | 'tactics'
  | 'squad'
  | 'recruitment'
  | 'staff'
  | 'setpieces'
  | 'matches';

export interface CommandPaletteItem {
  id: string;
  category: 'Navigation' | 'Formation Preset' | 'Squad Player' | 'Staff' | 'Scout Target';
  title: string;
  subtitle: string;
  badge?: string;
  onSelect: () => void;
}

export interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  players: PlayerRecord[];
  staff: StaffRecord[];
  scoutTargets: RecruitmentTarget[];
  activeShape: FormationPresetKey;
  onSelectTab: (tab: CommandTabId) => void;
  onSelectPlayer: (player: PlayerRecord) => void;
  onSelectStaff: (staffMember: StaffRecord) => void;
  onChangeShape: (shape: FormationPresetKey) => void;
  onOpenKnowledgeBase: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  players,
  staff,
  scoutTargets,
  activeShape,
  onSelectTab,
  onSelectPlayer,
  onSelectStaff,
  onChangeShape,
  onOpenKnowledgeBase,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
    }
  }, [isOpen]);

  const allItems = useMemo<CommandPaletteItem[]>(() => {
    const items: CommandPaletteItem[] = [
      {
        id: 'nav-sync',
        category: 'Navigation',
        title: 'Hub & AI Tactical Analyst',
        subtitle: 'Import your .fm save or chat with the AI Tactical Co-Pilot',
        badge: 'Tab',
        onSelect: () => {
          onSelectTab('sync');
          onClose();
        },
      },
      {
        id: 'nav-squad',
        category: 'Navigation',
        title: `Squad Analytics (${players.length} Players)`,
        subtitle: 'Inspect player attributes, role fit scores, and season output',
        badge: 'Tab',
        onSelect: () => {
          onSelectTab('squad');
          onClose();
        },
      },
      {
        id: 'nav-tactics',
        category: 'Navigation',
        title: 'Tactical War Room & Matchday Companion',
        subtitle: 'Dual-Phase IP/OOP Best XI, Rest Defence Matrix, and Touchline Companion',
        badge: 'Tab',
        onSelect: () => {
          onSelectTab('tactics');
          onClose();
        },
      },
      {
        id: 'nav-recruitment',
        category: 'Navigation',
        title:
          scoutTargets.length > 0
            ? `Transfers, Contracts & Scout Pool (${scoutTargets.length})`
            : 'Transfers, Contracts & Scout Pool',
        subtitle: 'Club DNA scouting, contract horizon monitor, and squad depth audit',
        badge: 'Tab',
        onSelect: () => {
          onSelectTab('recruitment');
          onClose();
        },
      },
      ...(staff.length > 0
        ? [
            {
              id: 'nav-staff',
              category: 'Navigation' as const,
              title: `Staff Directory (${staff.length})`,
              subtitle: '8-department coaching, medical, and recruitment efficiency audit',
              badge: 'Tab',
              onSelect: () => {
                onSelectTab('staff');
                onClose();
              },
            },
          ]
        : []),
      {
        id: 'nav-setpieces',
        category: 'Navigation',
        title: 'Set Pieces & Training',
        subtitle: 'Aerial corner routines, penalty takers, and training schedules',
        badge: 'Tab',
        onSelect: () => {
          onSelectTab('setpieces');
          onClose();
        },
      },
      {
        id: 'nav-matches',
        category: 'Navigation',
        title: 'Match Log Archive & 1-Click AI Debriefs',
        subtitle: 'Review fixtures, xG trends, and post-match tactical audits',
        badge: 'Tab',
        onSelect: () => {
          onSelectTab('matches');
          onClose();
        },
      },
      {
        id: 'nav-kb',
        category: 'Navigation',
        title: 'FM27 Patch 27.1.0 Verified Knowledge Base',
        subtitle: 'Open Dual-Phase IP/OOP role definitions and Playbook v2.0 laws',
        badge: 'Modal',
        onSelect: () => {
          onOpenKnowledgeBase();
          onClose();
        },
      },
    ];

    (Object.keys(FORMATION_PRESETS) as FormationPresetKey[]).forEach((shape) => {
      items.push({
        id: `shape-${shape}`,
        category: 'Formation Preset',
        title: `Switch Formation to ${shape}`,
        subtitle:
          shape === activeShape
            ? 'Currently active formation preset in Tactical War Room'
            : 'Apply formation preset and jump to Tactical War Room',
        badge: shape === activeShape ? 'Active' : 'Preset',
        onSelect: () => {
          onChangeShape(shape);
          onSelectTab('tactics');
          onClose();
        },
      });
    });

    players.forEach((p) => {
      items.push({
        id: `player-${p.id}`,
        category: 'Squad Player',
        title: p.name,
        subtitle: `${p.position} · Age ${p.age} · IP: ${p.ipRole} / OOP: ${p.oopRole}`,
        badge: `${p.ability.toFixed(1)}★`,
        onSelect: () => {
          onSelectPlayer(p);
          onClose();
        },
      });
    });

    staff.forEach((s) => {
      items.push({
        id: `staff-${s.id}`,
        category: 'Staff',
        title: s.name,
        subtitle: `${s.role} · ${s.club} · Age ${s.age}`,
        badge: s.nation,
        onSelect: () => {
          onSelectStaff(s);
          onClose();
        },
      });
    });

    scoutTargets.forEach((t, idx) => {
      items.push({
        id: `target-${t.uid || idx}-${t.name}`,
        category: 'Scout Target',
        title: t.name,
        subtitle: `${t.primaryPosition} · Age ${t.age} · ${t.nationality} · ${
          t.isFreeAgent ? 'Free Agent' : `Expires ${t.expires || '≤6m'}`
        }`,
        badge: t.isFreeAgent ? 'Free' : 'Scouted',
        onSelect: () => {
          onSelectTab('recruitment');
          onClose();
        },
      });
    });

    return items;
  }, [
    players,
    staff,
    scoutTargets,
    activeShape,
    onSelectTab,
    onSelectPlayer,
    onSelectStaff,
    onChangeShape,
    onOpenKnowledgeBase,
    onClose,
  ]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return allItems.slice(0, 28);
    }
    return allItems
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
      )
      .slice(0, 35);
  }, [allItems, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setActiveIndex((prev) => (prev + 1) % filteredItems.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setActiveIndex((prev) =>
          prev - 1 < 0 ? filteredItems.length - 1 : prev - 1
        );
      }
      return;
    }
    if (e.key === 'Enter' && filteredItems[activeIndex]) {
      e.preventDefault();
      filteredItems[activeIndex].onSelect();
    }
  };

  const renderCategoryIcon = (cat: CommandPaletteItem['category']) => {
    switch (cat) {
      case 'Navigation':
        return <Command className="h-4 w-4 text-emerald-400 shrink-0" />;
      case 'Formation Preset':
        return <Shield className="h-4 w-4 text-sky-400 shrink-0" />;
      case 'Squad Player':
        return <User className="h-4 w-4 text-amber-300 shrink-0" />;
      case 'Staff':
        return <UserCheck className="h-4 w-4 text-purple-300 shrink-0" />;
      case 'Scout Target':
        return <Briefcase className="h-4 w-4 text-teal-300 shrink-0" />;
    }
  };

  return (
    <MobileSheetFrame
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Quick-Jump Command Palette"
      maxWidthClass="sm:max-w-xl"
      alignTopDesktop
      onKeyDown={handleKeyDown}
      bodyClassName="p-2"
      customHeader={
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <Search className="h-4 w-4 text-emerald-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to player, staff, tab, formation, or scout target..."
            className="w-full min-h-[40px] bg-transparent text-base sm:text-sm text-white placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Command Palette"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition cursor-pointer shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      }
      footerClassName="hidden sm:block"
      footer={
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
                ↑↓
              </kbd>{' '}
              Navigate
            </span>
            <span>
              <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
                ↵
              </kbd>{' '}
              Select
            </span>
            <span>
              <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
                Esc
              </kbd>{' '}
              Close
            </span>
          </div>
          <span className="font-mono text-[10px] text-emerald-400">
            Shortcut: ⌘K / Ctrl+K
          </span>
        </div>
      }
    >
      {/* Results List */}
      <div className="max-h-[62dvh] sm:max-h-[60dvh] space-y-1">
        {filteredItems.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            No matching players, staff, formations, or tabs for &ldquo;{query}&rdquo;.
          </div>
        ) : (
          filteredItems.map((item, idx) => {
            const isSelected = idx === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={item.onSelect}
                className={`w-full min-h-[44px] flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-white'
                    : 'border border-transparent hover:bg-slate-800/70 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {renderCategoryIcon(item.category)}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold truncate">
                        {item.title}
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 shrink-0">
                        {item.category}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {item.subtitle}
                    </div>
                  </div>
                </div>
                {item.badge && (
                  <span className="shrink-0 rounded-md bg-slate-950/80 border border-slate-700 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </MobileSheetFrame>
  );
};
