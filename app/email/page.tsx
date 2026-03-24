'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { RecipientFilter } from '@/components/email/RecipientFilter';
import { Send, Eye, History, ChevronDown, X, Search } from 'lucide-react';
import Link from 'next/link';
import type { Form, CustomField, Volunteer } from '@/lib/types';
import type { FilterRule } from '@/lib/filter-volunteers';

const RichTextEditor = dynamic(() => import('@/components/email/RichTextEditor'), {
  ssr: false,
  loading: () => <div className="w-full min-h-[240px] animate-pulse bg-gray-50 rounded" />,
});

type SelectedVol = Pick<Volunteer, 'id' | 'first_name' | 'last_name' | 'email'>;

function buildFilterSummary(rules: FilterRule[], customFields: CustomField[], forms: Form[]): string {
  if (!rules.length) return '';
  const parts = rules.slice(0, 3).map(r => {
    if (r.field === 'tags') return `tag: ${r.value}`;
    if (r.field === 'source_form_id') {
      return `Form: ${forms.find(f => f.id === r.value)?.name ?? 'set'}`;
    }
    if (r.field === 'phone') return r.operator === 'is_not_empty' ? 'has phone' : 'no phone';
    if (r.field === 'zip_code') return `Zip: ${r.value}`;
    if (r.field.startsWith('custom:')) {
      const key = r.field.slice(7);
      const cf = customFields.find(f => f.key === key);
      return `${cf?.name ?? key}: ${r.value || r.operator}`;
    }
    return `${r.field}: ${r.value || r.operator}`;
  });
  const suffix = rules.length > 3 ? ` +${rules.length - 3} more` : '';
  return parts.join(', ') + suffix;
}

export default function EmailComposePageWrapper() {
  return (
    <Suspense>
      <EmailComposePage />
    </Suspense>
  );
}

function EmailComposePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [preview, setPreview] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sendMode, setSendMode] = useState<'all' | 'specific'>('all');
  const [selectedVolunteers, setSelectedVolunteers] = useState<SelectedVol[]>([]);
  const [toSearch, setToSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SelectedVol[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    fetch('/api/forms').then(r => r.json()).then(json => setForms(json.data || []));
    fetch('/api/fields').then(r => r.json()).then(json =>
      setCustomFields(Array.isArray(json) ? json : [])
    );
  }, []);

  // Pre-fill recipient from ?volunteer_id= query param
  useEffect(() => {
    const volId = searchParams.get('volunteer_id');
    if (!volId) return;
    fetch(`/api/volunteers/${volId}`)
      .then(r => r.json())
      .then(vol => {
        if (vol?.id) {
          setSendMode('specific');
          setSelectedVolunteers([{
            id: vol.id, first_name: vol.first_name,
            last_name: vol.last_name, email: vol.email,
          }]);
        }
      })
      .catch(() => {});
  }, [searchParams]);

  // Pre-fill recipients from volunteers page bulk "Email Group" action
  useEffect(() => {
    if (!searchParams.get('from_group')) return;
    const raw = sessionStorage.getItem('emailGroupVolunteers');
    if (!raw) return;
    try {
      const vols: SelectedVol[] = JSON.parse(raw);
      if (vols.length) {
        setSendMode('specific');
        setSelectedVolunteers(vols);
        sessionStorage.removeItem('emailGroupVolunteers');
      }
    } catch {}
  }, [searchParams]);

  // Search volunteers for "specific" mode (debounced)
  useEffect(() => {
    if (sendMode !== 'specific' || !toSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/volunteers?search=${encodeURIComponent(toSearch)}&limit=8&status=active`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const json = await res.json();
        setSearchResults(
          (json.data || []).map((v: Volunteer) => ({
            id: v.id, first_name: v.first_name, last_name: v.last_name, email: v.email,
          })),
        );
        setSearchOpen(true);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.error(e);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [toSearch, sendMode]);

  // Re-count recipients whenever filters change (debounced, with abort on change)
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setCountLoading(true);
      try {
        const res = await fetch('/api/volunteers/count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rules }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = await res.json();
        setRecipientCount(json.count ?? 0);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.error(e);
      } finally {
        setCountLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [rules]);

  async function handlePreview() {
    const res = await fetch('/api/email/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: body }),
    });
    const json = await res.json();
    setPreview(json.html || '');
    setShowPreview(true);
  }

  function buildConfirmMessage(): string {
    if (sendMode === 'specific') {
      const names = selectedVolunteers.map(v => `${v.first_name} ${v.last_name}`);
      if (names.length <= 3) return `Send this email to ${names.join(', ')}?`;
      return `Send this email to ${names.slice(0, 2).join(', ')}, and ${names.length - 2} more?`;
    }
    return `Send this email to approximately ${recipientCount} recipients?`;
  }

  async function handleSend() {
    if (!subject || !body) return;
    if (sendMode === 'specific' && selectedVolunteers.length === 0) return;
    if (!confirm(buildConfirmMessage())) return;

    setSending(true);
    const payload: Record<string, unknown> = {
      subject,
      body,
      from_address: fromName && fromEmail ? `${fromName} <${fromEmail}>` : fromEmail,
      cc: cc.split(/,\s*/).filter(Boolean),
      bcc: bcc.split(/,\s*/).filter(Boolean),
    };
    if (sendMode === 'specific') {
      payload.volunteer_ids = selectedVolunteers.map(v => v.id);
    } else {
      payload.filter_criteria = { rules };
    }

    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      router.push('/email/history');
    } else {
      const json = await res.json();
      alert(json.error || 'Failed to send');
      setSending(false);
    }
  }

  const countLabel = countLoading ? '…' : (recipientCount ?? '…');
  const filterSummary = buildFilterSummary(rules, customFields, forms);

  return (
    <div>
      <PageHeader
        title="Compose Email"
        description="Send bulk emails to volunteers"
        actions={
          <Link href="/email/history">
            <Button variant="secondary">
              <History className="w-4 h-4 mr-2" />
              Send History
            </Button>
          </Link>
        }
      />

      <div className="max-w-4xl">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">

          {/* From row */}
          <div className="flex items-center border-b border-gray-100">
            <span className="w-20 shrink-0 py-3 px-4 text-sm text-gray-500 font-medium">From</span>
            <div className="flex-1 py-2 px-3 flex items-center gap-2">
              <input
                type="text"
                className="flex-1 border-0 bg-transparent text-sm focus:ring-0 focus:outline-none py-1"
                value={fromName}
                onChange={e => setFromName(e.target.value)}
                placeholder="Rachel from Vote Miller"
              />
              <input
                type="email"
                className="w-56 border-0 bg-transparent text-sm focus:ring-0 focus:outline-none py-1 text-gray-500"
                value={fromEmail}
                onChange={e => setFromEmail(e.target.value)}
                placeholder="volunteer@votemiller.com"
              />
            </div>
          </div>

          {/* To row */}
          <div className="border-b border-gray-100">
            <div className="flex items-center min-h-[44px]">
              <span className="w-20 shrink-0 py-3 px-4 text-sm text-gray-500 font-medium">To</span>
              <div className="flex-1 py-2 px-3 flex items-center gap-2 min-w-0">
                {/* Mode toggle */}
                <div className="flex rounded border border-gray-200 text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => setSendMode('all')}
                    className={`px-2.5 py-1 font-medium transition-colors ${sendMode === 'all' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendMode('specific')}
                    className={`px-2.5 py-1 font-medium transition-colors border-l border-gray-200 ${sendMode === 'specific' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Specific
                  </button>
                </div>

                {sendMode === 'all' ? (
                  <>
                    <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">
                      {filterSummary ? (
                        <>{countLabel} recipients · <span className="text-gray-500">{filterSummary}</span></>
                      ) : (
                        <span className="text-gray-500">All active volunteers · {countLabel} recipients</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFilterOpen(o => !o)}
                      className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded px-2 py-1 transition-colors shrink-0"
                    >
                      Filter
                      <ChevronDown
                        className={`w-3 h-3 transition-transform duration-150 ${filterOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </>
                ) : (
                  <div className="flex-1 min-w-0">
                    {/* Selected volunteer chips */}
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {selectedVolunteers.map(v => (
                        <span key={v.id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 text-xs rounded-full px-2.5 py-1">
                          {v.first_name} {v.last_name}
                          <span className="text-blue-400 text-[10px]">{v.email}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedVolunteers(s => s.filter(sv => sv.id !== v.id))}
                            className="text-blue-400 hover:text-blue-600 ml-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      {/* Search input */}
                      <div className="relative inline-block">
                        <input
                          type="text"
                          value={toSearch}
                          onChange={e => setToSearch(e.target.value)}
                          onFocus={() => { if (searchResults.length) setSearchOpen(true); }}
                          onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                          placeholder={selectedVolunteers.length ? 'Add more...' : 'Search by name or email...'}
                          className="border-0 bg-transparent text-sm focus:ring-0 focus:outline-none py-1 w-52"
                        />
                        {/* Search dropdown */}
                        {searchOpen && searchResults.length > 0 && (
                          <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                            {searchResults
                              .filter(r => !selectedVolunteers.some(s => s.id === r.id))
                              .map(v => (
                                <button
                                  key={v.id}
                                  type="button"
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => {
                                    setSelectedVolunteers(s => [...s, v]);
                                    setToSearch('');
                                    setSearchResults([]);
                                    setSearchOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2"
                                >
                                  <Search className="w-3 h-3 text-gray-400 shrink-0" />
                                  <span className="font-medium">{v.first_name} {v.last_name}</span>
                                  <span className="text-gray-400 text-xs truncate">{v.email}</span>
                                </button>
                              ))}
                            {searchResults.every(r => selectedVolunteers.some(s => s.id === r.id)) && (
                              <p className="px-3 py-2 text-xs text-gray-400">All results already selected</p>
                            )}
                          </div>
                        )}
                        {searchOpen && toSearch.trim() && searchResults.length === 0 && (
                          <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                            <p className="px-3 py-2 text-xs text-gray-400">No volunteers found</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 shrink-0">
                  {!showCc && (
                    <button
                      type="button"
                      onClick={() => setShowCc(true)}
                      className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      CC
                    </button>
                  )}
                  {!showBcc && (
                    <button
                      type="button"
                      onClick={() => setShowBcc(true)}
                      className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      BCC
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Filter panel (only in "all" mode) */}
            {sendMode === 'all' && filterOpen && (
              <div className="px-4 pb-4 border-t border-gray-50">
                <div className="pt-3 min-w-0">
                  <RecipientFilter
                    rules={rules}
                    onChange={setRules}
                    customFields={customFields}
                    forms={forms}
                  />
                  {rules.length > 1 && (
                    <p className="text-xs text-gray-400 mt-2">All conditions must match (AND)</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* CC row */}
          {showCc && (
            <div className="flex items-center border-b border-gray-100">
              <span className="w-20 shrink-0 py-3 px-4 text-sm text-gray-500 font-medium">CC</span>
              <div className="flex-1 py-2 px-3 flex items-center gap-2">
                <input
                  type="text"
                  className="flex-1 border-0 bg-transparent text-sm focus:ring-0 focus:outline-none py-1"
                  value={cc}
                  onChange={e => setCc(e.target.value)}
                  placeholder="email@example.com, another@example.com"
                />
                <span className="text-xs text-gray-400 shrink-0">Appears on every individual email sent</span>
                <button
                  type="button"
                  onClick={() => { setShowCc(false); setCc(''); }}
                  className="text-gray-300 hover:text-gray-500 transition-colors shrink-0"
                  aria-label="Remove CC"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* BCC row */}
          {showBcc && (
            <div className="flex items-center border-b border-gray-100">
              <span className="w-20 shrink-0 py-3 px-4 text-sm text-gray-500 font-medium">BCC</span>
              <div className="flex-1 py-2 px-3 flex items-center gap-2">
                <input
                  type="text"
                  className="flex-1 border-0 bg-transparent text-sm focus:ring-0 focus:outline-none py-1"
                  value={bcc}
                  onChange={e => setBcc(e.target.value)}
                  placeholder="email@example.com"
                />
                <span className="text-xs text-gray-400 shrink-0">Appears on every individual email sent</span>
                <button
                  type="button"
                  onClick={() => { setShowBcc(false); setBcc(''); }}
                  className="text-gray-300 hover:text-gray-500 transition-colors shrink-0"
                  aria-label="Remove BCC"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Subject row */}
          <div className="flex items-center border-b border-gray-100">
            <span className="w-20 shrink-0 py-3 px-4 text-sm text-gray-500 font-medium">Subject</span>
            <div className="flex-1 py-2 px-3">
              <input
                type="text"
                className="w-full border-0 bg-transparent text-sm focus:ring-0 focus:outline-none py-1"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Campaign update for {{first_name}}"
              />
            </div>
          </div>

          {/* Body */}
          <div className="p-4">
            <RichTextEditor
              initialValue={body}
              onChange={setBody}
              placeholder="Start writing your email..."
            />
            <p className="text-xs text-gray-400 mt-2">
              Template variables: {'{{first_name}}'}, {'{{last_name}}'}, {'{{email}}'}
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <Button variant="secondary" onClick={handlePreview} disabled={!body}>
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending || !subject || !body || (sendMode === 'all' ? recipientCount === 0 : selectedVolunteers.length === 0)}
            >
              <Send className="w-4 h-4 mr-2" />
              {sending ? 'Sending…' : `Send to ${sendMode === 'specific' ? selectedVolunteers.length : countLabel} recipients`}
            </Button>
          </div>
        </div>

        {showPreview && (
          <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Preview (sample data)</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <iframe
              srcDoc={preview}
              sandbox=""
              className="w-full h-64 border border-gray-200 rounded"
              title="Email Preview"
            />
          </div>
        )}
      </div>
    </div>
  );
}
