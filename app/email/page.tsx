'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { RecipientFilter } from '@/components/email/RecipientFilter';
import { Send, Eye, History, ChevronDown, X } from 'lucide-react';
import Link from 'next/link';
import type { Form, CustomField } from '@/lib/types';
import type { FilterRule } from '@/lib/filter-volunteers';

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

export default function EmailComposePage() {
  const router = useRouter();
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

  useEffect(() => {
    fetch('/api/forms').then(r => r.json()).then(json => setForms(json.data || []));
    fetch('/api/fields').then(r => r.json()).then(json =>
      setCustomFields(Array.isArray(json) ? json : [])
    );
  }, []);

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

  async function handleSend() {
    if (!subject || !body) return;
    if (!confirm(`Send this email to approximately ${recipientCount} recipients?`)) return;

    setSending(true);
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        body,
        from_address: fromName && fromEmail ? `${fromName} <${fromEmail}>` : fromEmail,
        cc: cc.split(/,\s*/).filter(Boolean),
        bcc: bcc.split(/,\s*/).filter(Boolean),
        filter_criteria: { rules },
      }),
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
                <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">
                  {filterSummary ? (
                    <>{countLabel} recipients · <span className="text-gray-500">{filterSummary}</span></>
                  ) : (
                    <span className="text-gray-500">All active volunteers · {countLabel} recipients</span>
                  )}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setFilterOpen(o => !o)}
                    className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded px-2 py-1 transition-colors"
                  >
                    Filter
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-150 ${filterOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
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

            {/* Filter panel */}
            {filterOpen && (
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
            <textarea
              className="w-full min-h-[240px] border-0 bg-transparent text-sm focus:ring-0 focus:outline-none resize-none"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="<p>Hi {{first_name}},</p><p>Here's an update...</p>"
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
              disabled={sending || !subject || !body || recipientCount === 0}
            >
              <Send className="w-4 h-4 mr-2" />
              {sending ? 'Sending…' : `Send to ${countLabel} recipients`}
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
