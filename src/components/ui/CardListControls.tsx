interface SortOption {
  value: string;
  label: string;
}

interface FilterOption {
  value: string;
  label: string;
  group?: string;
}

interface CardListControlsProps {
  count: number;
  itemLabel?: string;
  sortOptions: SortOption[];
  currentSort: string;
  onSortChange: (value: string) => void;
  filterOptions?: FilterOption[];
  activeFilters?: string[];
  onFilterChange?: (filters: string[]) => void;
  allExpanded: boolean;
  onToggleExpand: () => void;
}

export function CardListControls({
  count,
  itemLabel = 'items',
  sortOptions,
  currentSort,
  onSortChange,
  filterOptions,
  activeFilters = [],
  onFilterChange,
  allExpanded,
  onToggleExpand,
}: CardListControlsProps) {
  const toggleFilter = (value: string) => {
    if (!onFilterChange) return;
    if (activeFilters.includes(value)) {
      onFilterChange(activeFilters.filter((f) => f !== value));
    } else {
      onFilterChange([...activeFilters, value]);
    }
  };

  return (
    <div className="space-y-2">
      {/* Main controls row */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-text-muted whitespace-nowrap">
          {count} {itemLabel}
        </span>

        <div className="flex-1" />

        {/* Sort dropdown */}
        <label className="flex items-center gap-1 text-text-muted whitespace-nowrap">
          Sort:
          <select
            value={currentSort}
            onChange={(e) => onSortChange(e.target.value)}
            className="bg-bg-card border border-white/10 rounded px-1.5 py-0.5 min-h-[44px] text-text-primary text-xs outline-none focus:border-accent/50"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {/* Expand / Collapse toggle */}
        <button
          onClick={onToggleExpand}
          className="text-text-muted hover:text-text-primary whitespace-nowrap transition-colors min-h-[44px] px-2"
        >
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      {/* Filter chips (if filter options provided) */}
      {filterOptions && filterOptions.length > 0 && onFilterChange && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {filterOptions.map((opt) => {
            const isActive = activeFilters.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggleFilter(opt.value)}
                className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1.5 min-h-[44px] text-xs border transition-colors ${
                  isActive
                    ? 'bg-accent/15 border-accent/40 text-accent'
                    : 'bg-bg-card border-white/10 text-text-muted hover:text-text-secondary'
                }`}
              >
                {opt.label}
                {isActive && (
                  <span
                    className="ml-0.5 text-accent/70 hover:text-accent"
                    aria-label={`Remove ${opt.label} filter`}
                  >
                    ×
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
