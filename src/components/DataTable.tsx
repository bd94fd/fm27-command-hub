import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: 'left' | 'right';
  minWidth?: string;
  sortValue?: (row: T) => string | number | boolean | null | undefined;
  render: (row: T) => ReactNode;
  cellClassName?: (row: T) => string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: TableColumn<T>[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  emptyMessage?: string;
  emptyAction?: ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  defaultSortKey,
  defaultSortDir = 'asc',
  emptyMessage = 'No records match the current filters.',
  emptyAction,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col || !col.sortValue) return rows;
    const getVal = col.sortValue;

    return [...rows].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (av === bv) return 0;
      if (av === null || av === undefined || av === '') return 1;
      if (bv === null || bv === undefined || bv === '') return -1;

      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else if (typeof av === 'boolean' && typeof bv === 'boolean') {
        cmp = Number(av) - Number(bv);
      } else {
        cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, columns, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[7px] border border-[#59515f] bg-[#100e14]">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="fm-grid-table w-full border-collapse text-[13px] text-[#f0edf4]">
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                const canSort = col.sortable !== false && Boolean(col.sortValue);
                return (
                  <th
                    key={col.key}
                    style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                    className={`h-[42px] whitespace-nowrap px-3 text-left select-none ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={`inline-flex items-center gap-1.5 text-[#bfb3c8] transition-colors hover:text-white cursor-pointer ${
                          col.align === 'right' ? 'flex-row-reverse' : ''
                        }`}
                      >
                        <span>{col.header}</span>
                        {isSorted ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-[#dc87ff]" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-[#dc87ff]" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-55" />
                        )}
                      </button>
                    ) : (
                      <span>{col.header}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-14 px-6 text-center text-[13px] text-[#b2acbb]"
                >
                  <div className="flex flex-col items-center gap-3">
                    <span>{emptyMessage}</span>
                    {emptyAction}
                  </div>
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  className={`border-b border-white/[0.04] transition-colors ${
                    onRowClick ? 'cursor-pointer focus:outline-none focus:bg-[#493054]' : ''
                  }`}
                >
                  {columns.map((col, idx) => (
                    <td
                      key={col.key}
                      className={`h-[36px] whitespace-nowrap px-3 tabular-nums ${
                        idx === 0 ? 'font-semibold text-[#faf5fc]' : ''
                      } ${col.align === 'right' ? 'text-right' : 'text-left'} ${
                        col.cellClassName ? col.cellClassName(row) : ''
                      }`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
