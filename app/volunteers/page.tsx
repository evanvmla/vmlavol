'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Table, Thead, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useRouter } from 'next/navigation';
import { Plus, Search, Download, SlidersHorizontal, ChevronUp, ChevronDown, ChevronsUpDown, X, Mail, Phone, Tag } from 'lucide-react';
import type { Volunteer, CustomField } from '@/lib/types';
import { type FilterRule } from '@/lib/filter-volunteers';
import { RecipientFilter } from '@/components/email/RecipientFilter';
import { filterVolunteersWithEmail } from '@/lib/email-group-helpers';

const statusColors: Record<string, 'green' | 'gray' | 'red'> = {
  active: 'green',
  inactive: 'gray',
  do_not_contact: 'red',
};

type QuickFilter = 'volunteers' | 'nc' | 'numero' | null;

type SortDir = 'asc' | 'desc';

function formatCellValue(value: unknown, fieldType: CustomField['field_type']): string {
  if (value === null || value === undefined || value === '') return '-';
  if (fieldType === 'checkbox') return value ? 'Yes' : 'No';
  if (fieldType === 'multiselect' && Array.isArray(value)) {
    const items = value as string[];
    if (items.length <= 2) return items.join(', ');
    return `${items.slice(0, 2).join(', ')} +${items.length - 2} more`;
  }
  if (fieldType === 'date' && typeof value === 'string') {
    try { return new Date(value).toLocaleDateString(); } catch { return String(value); }
  }
  const s = String(value);
  return s.length > 30 ? s.slice(0, 30) + '…' : s;
}

function SortableHeader({
  col, label, sortCol, sortDir, onSort, className = '',
}: {
  col: string; label: string; sortCol: string; sortDir: SortDir; onSort: (col: string) => void; className?: string;
}) {
  const active = sortCol === col;
  const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none ${className}`}
    >
      <div className="flex items-center gap-1">
        {label}
        <Icon className={`w-3 h-3 ${active ? 'text-blue-500' : 'opacity-40'}`} />
      </div>
    </th>
  );
}

export default function VolunteersPage() {
  const router = useRouter();
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [sortCol, setSortCol] = useState('first_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [showRemoveTagModal, setShowRemoveTagModal] = useState(false);
  const [bulkTag, setBulkTag] = useState('');
  const [bulkTagLoading, setBulkTagLoading] = useState(false);
  const [selectedRemoveTag, setSelectedRemoveTag] = useState('');
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [limit, setLimit] = useState(50);
  const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

  useEffect(() => {
    fetch('/api/fields')
      .then((r) => r.json())
      .then((data) => setCustomFields(Array.isArray(data) ? data : []));
  }, []);

  const buildParams = useCallback((overrides: Record<string, string> = {}) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort_col: sortCol,
      sort_dir: sortDir,
      ...overrides,
    });
    if (search) params.set('search', search);
    const allRules = [...rules];
    if (quickFilter === 'volunteers') {
      allRules.push({ id: '_qf', field: 'tags', operator: 'not_contains', value: 'NC' });
    } else if (quickFilter === 'nc') {
      allRules.push({ id: '_qf', field: 'tags', operator: 'contains', value: 'NC' });
    } else if (quickFilter === 'numero') {
      allRules.push({ id: '_qf', field: 'tags', operator: 'contains', value: 'numero' });
    }
    if (allRules.length > 0) params.set('rules', JSON.stringify(allRules));
    return params;
  }, [page, limit, search, quickFilter, rules, sortCol, sortDir]);

  const fetchVolunteers = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    const res = await fetch(`/api/volunteers?${buildParams()}`);
    const json = await res.json();
    setVolunteers(json.data || []);
    setTotal(json.total || 0);
    setLoading(false);
  }, [buildParams]);

  useEffect(() => {
    const timer = setTimeout(fetchVolunteers, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchVolunteers]);

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(1);
  }

  function clearFilters() {
    setQuickFilter(null);
    setRules([]);
    setPage(1);
  }

  // Selection logic
  const allOnPageSelected = volunteers.length > 0 && volunteers.every(v => selectedIds.has(v.id));
  const someSelected = selectedIds.size > 0;
  const someButNotAll = someSelected && !allOnPageSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someButNotAll;
    }
  }, [someButNotAll]);

  function toggleAll() {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(volunteers.map(v => v.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const existingTags = Array.from(new Set(volunteers.flatMap(v => v.tags || []))).sort();
  const selectedVolunteers = volunteers.filter(v => selectedIds.has(v.id));
  const selectedTags = Array.from(new Set(selectedVolunteers.flatMap(v => v.tags || []))).sort();

  async function handleBulkAddTag() {
    const tag = bulkTag.trim();
    if (!tag) return;
    setBulkTagLoading(true);
    try {
      const res = await fetch('/api/volunteers/bulk-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), tag }),
      });
      if (res.ok) {
        setShowAddTagModal(false);
        setBulkTag('');
        setSelectedIds(new Set());
        fetchVolunteers();
      }
    } finally {
      setBulkTagLoading(false);
    }
  }

  async function handleBulkRemoveTag() {
    if (!selectedRemoveTag) return;
    setBulkTagLoading(true);
    try {
      const res = await fetch('/api/volunteers/bulk-tag', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), tag: selectedRemoveTag }),
      });
      if (res.ok) {
        setShowRemoveTagModal(false);
        setSelectedRemoveTag('');
        setSelectedIds(new Set());
        fetchVolunteers();
      }
    } finally {
      setBulkTagLoading(false);
    }
  }

  const activeFilterCount = (quickFilter ? 1 : 0) + rules.filter(r => r.value || ['is_empty', 'is_not_empty'].includes(r.operator) || r.field === 'phone').length;

  async function handleExport() {
    const params = buildParams({ page: '1', limit: '10000' });
    const res = await fetch(`/api/volunteers?${params}`);
    const json = await res.json();
    const vols: Volunteer[] = json.data || [];

    const cfHeaders = customFields.map((f) => f.name);
    const headers = ['Email', 'First Name', 'Last Name', 'Phone', 'Zip', 'Status', 'Tags', 'Created', ...cfHeaders];
    const rows = vols.map((v) => [
      v.email, v.first_name, v.last_name, v.phone || '', v.zip_code || '',
      v.status, (v.tags || []).join('; '), new Date(v.created_at).toLocaleDateString(),
      ...customFields.map((f) => {
        const val = v.custom_data?.[f.key];
        if (Array.isArray(val)) return val.join('; ');
        return val != null ? String(val) : '';
      }),
    ]);

    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'volunteers.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <PageHeader
        title="Volunteers"
        description={`${total} total volunteers`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Link href="/volunteers/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Volunteer
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search volunteers..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => setShowFilters((f) => !f)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        {showFilters && (
          <div className="p-4 bg-white rounded-lg border border-gray-200 space-y-4 max-w-[50%]">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Quick filter</label>
              <div className="flex gap-2">
                {([['volunteers', 'Volunteers'], ['nc', 'Neighborhood Councils'], ['numero', 'Numero']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setQuickFilter(quickFilter === key ? null : key); setPage(1); }}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      quickFilter === key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs font-medium text-gray-500 mb-2">Conditions</p>
              <RecipientFilter
                rules={rules}
                onChange={(r) => { setRules(r); setPage(1); }}
                customFields={customFields}
                forms={[]}
              />
            </div>
          </div>
        )}
      </div>

      {someSelected && (
        <div className="mb-4 hidden md:flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-blue-700">{selectedIds.size} selected</span>
          <Button size="sm" variant="secondary" onClick={() => { setBulkTag(''); setShowAddTagModal(true); }}>
            <Tag className="w-3.5 h-3.5 mr-1.5" />
            Add Tag
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { setSelectedRemoveTag(''); setShowRemoveTagModal(true); }}>
            <Tag className="w-3.5 h-3.5 mr-1.5" />
            Remove Tag
          </Button>
          <Button size="sm" variant="secondary" onClick={() => {
            const filtered = filterVolunteersWithEmail(volunteers, selectedIds);
            if (filtered.length === 0) {
              alert('None of the selected volunteers have email addresses.');
              return;
            }
            try {
              sessionStorage.setItem('emailGroupVolunteers', JSON.stringify(filtered));
              router.push('/email?from_group=1');
            } catch {
              alert('Could not prepare email group. Please try again.');
            }
          }}>
            <Mail className="w-3.5 h-3.5 mr-1.5" />
            Email Group
          </Button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : volunteers.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">
            {search || activeFilterCount > 0 ? 'No results found.' : 'No volunteers yet.'}
          </p>
        </div>
      ) : (
        <>
          <Table>
            <Thead>
              <tr>
                <th className="hidden md:table-cell px-4 py-3 w-10">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <SortableHeader col="first_name" label="Name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader col="status" label="Status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                <Th className="hidden md:table-cell">Tags</Th>
                <SortableHeader col="created_at" label="Joined" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                {customFields.map((field) => (
                  <SortableHeader
                    key={field.id}
                    col={`custom:${field.key}`}
                    label={field.name}
                    sortCol={sortCol}
                    sortDir={sortDir}
                    onSort={handleSort}
                    className="hidden md:table-cell"
                  />
                ))}
              </tr>
            </Thead>
            <tbody className="divide-y divide-gray-200">
              {volunteers.map((vol) => (
                <tr key={vol.id} className="hover:bg-gray-50">
                  <Td className="hidden md:table-cell">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(vol.id)}
                      onChange={() => toggleOne(vol.id)}
                      className="rounded border-gray-300"
                    />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/volunteers/${vol.id}`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        {vol.first_name} {vol.last_name}
                      </Link>
                      {vol.email && (
                        <Link href={`/email?volunteer_id=${vol.id}`} title={vol.email}>
                          <Mail className="w-4 h-4 text-gray-400 hover:text-blue-600" />
                        </Link>
                      )}
                      {vol.phone && (
                        <a href={`tel:${vol.phone}`} title={vol.phone}>
                          <Phone className="w-4 h-4 text-gray-400 hover:text-green-600" />
                        </a>
                      )}
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <Badge color={statusColors[vol.status]}>{vol.status}</Badge>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <div className="flex gap-1 items-center">
                      {(vol.tags || []).slice(0, 2).map((tag) => (
                        <Badge key={tag} color="purple">{tag}</Badge>
                      ))}
                      {(vol.tags || []).length > 2 && (
                        <span className="text-xs text-gray-400">+{vol.tags.length - 2}</span>
                      )}
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">{new Date(vol.created_at).toLocaleDateString()}</Td>
                  {customFields.map((field) => (
                    <Td key={field.id} className="hidden md:table-cell max-w-[150px] truncate">
                      {formatCellValue(vol.custom_data?.[field.key], field.field_type)}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-4">
              {totalPages > 1 && (
                <>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    {(() => {
                      const pages: (number | '...')[] = [];
                      if (totalPages <= 7) {
                        for (let i = 1; i <= totalPages; i++) pages.push(i);
                      } else {
                        pages.push(1);
                        if (page > 3) pages.push('...');
                        for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
                        if (page < totalPages - 2) pages.push('...');
                        pages.push(totalPages);
                      }
                      return pages.map((p, idx) =>
                        p === '...' ? (
                          <span key={`ellipsis-${idx}`} className="px-1 text-sm text-gray-400">...</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`min-w-[32px] h-8 rounded-md text-sm font-medium ${
                              p === page
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {p}
                          </button>
                        )
                      );
                    })()}
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-sm text-gray-500">Go to</label>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      defaultValue={page}
                      key={page}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = Math.max(1, Math.min(totalPages, Number((e.target as HTMLInputElement).value)));
                          if (!isNaN(val)) setPage(val);
                        }
                      }}
                      className="w-14 rounded-md border border-gray-300 text-sm px-2 py-1 text-center focus:border-blue-500 focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Rows per page</label>
              <select
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                className="rounded-md border border-gray-300 text-sm px-2 py-1 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}
      <Modal open={showAddTagModal} onClose={() => setShowAddTagModal(false)} title={`Add tag to ${selectedIds.size} volunteer${selectedIds.size === 1 ? '' : 's'}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tag name</label>
            <input
              type="text"
              value={bulkTag}
              onChange={(e) => setBulkTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && bulkTag.trim()) handleBulkAddTag(); }}
              placeholder="Enter tag name..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>
          {existingTags.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Existing tags</p>
              <div className="flex flex-wrap gap-1">
                {existingTags.map((t) => (
                  <button key={t} onClick={() => setBulkTag(t)} className="cursor-pointer">
                    <Badge color="purple">{t}</Badge>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddTagModal(false)}>Cancel</Button>
            <Button disabled={bulkTag.trim() === '' || bulkTagLoading} onClick={handleBulkAddTag}>
              {bulkTagLoading ? 'Adding...' : 'Add Tag'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showRemoveTagModal} onClose={() => setShowRemoveTagModal(false)} title={`Remove tag from ${selectedIds.size} volunteer${selectedIds.size === 1 ? '' : 's'}`}>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-700 mb-2">Select tag to remove</p>
            {selectedTags.length === 0 ? (
              <p className="text-sm text-gray-400">Selected volunteers have no tags.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {selectedTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedRemoveTag(t)}
                    className={`cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                      selectedRemoveTag === t
                        ? 'bg-red-100 text-red-700 ring-2 ring-red-400'
                        : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowRemoveTagModal(false)}>Cancel</Button>
            <Button variant="danger" disabled={!selectedRemoveTag || bulkTagLoading} onClick={handleBulkRemoveTag}>
              {bulkTagLoading ? 'Removing...' : 'Remove Tag'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
