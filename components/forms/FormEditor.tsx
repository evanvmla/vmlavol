'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { ArrowLeft, Save, Trash2, Code, Copy, Eye } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { Form, CustomField } from '@/lib/types';

export function FormEditor({
  form,
  initialData,
  onSave,
  onDelete,
}: {
  form?: Form;
  initialData?: Partial<Form>;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onDelete?: () => void;
}) {
  const router = useRouter();
  const isNew = !form;
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const source = form || initialData;
  const [data, setData] = useState({
    name: source?.name || '',
    slug: source?.slug || '',
    description: source?.description || '',
    confirmation_message: source?.confirmation_message || '',
    welcome_email_subject: source?.welcome_email_subject || '',
    welcome_email_body: source?.welcome_email_body || '',
    field_ids: source?.field_ids || [] as string[],
    hidden_fields: source?.hidden_fields || [] as string[],
    is_active: source?.is_active !== false,
  });

  useEffect(() => {
    fetch('/api/fields').then((r) => r.json()).then(setFields);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave(data);
    setSaving(false);
  }

  function toggleField(fieldId: string) {
    setData((d) => ({
      ...d,
      field_ids: d.field_ids.includes(fieldId)
        ? d.field_ids.filter((id) => id !== fieldId)
        : [...d.field_ids, fieldId],
    }));
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const embedCode = `<iframe src="${appUrl}/embed/${form?.slug || data.slug}" width="100%" height="600" frameborder="0" style="border:none;max-width:500px;"></iframe>`;

  async function handlePreview() {
    try {
      const res = await fetch('/api/email/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: data.welcome_email_body }),
      });
      if (!res.ok) throw new Error('Preview failed');
      const { html } = await res.json();
      setPreview(html);
      setShowPreview(true);
    } catch {
      alert('Preview failed');
    }
  }

  function copyEmbed() {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <PageHeader
        title={isNew ? 'Create Form' : `Edit: ${form?.name}`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push('/forms')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            {onDelete && (
              <Button variant="danger" onClick={onDelete}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          <Input
            label="Form Name"
            value={data.name}
            onChange={(e) => setData({ ...data, name: e.target.value })}
            required
          />
          <Input
            label="URL Slug"
            value={data.slug}
            onChange={(e) => setData({ ...data, slug: e.target.value })}
            placeholder="e.g. general-signup"
            required
          />
          <Textarea
            label="Description (shown to visitors)"
            value={data.description}
            onChange={(e) => setData({ ...data, description: e.target.value })}
          />
          <Textarea
            label="Confirmation Message (shown after submission)"
            value={data.confirmation_message}
            onChange={(e) => setData({ ...data, confirmation_message: e.target.value })}
            placeholder="Thank you! Your signup has been received."
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={data.is_active}
              onChange={(e) => setData({ ...data, is_active: e.target.checked })}
              className="rounded border-gray-300"
            />
            Form is active
          </label>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Default Fields</h3>
            <div className="space-y-1 text-sm text-gray-500">
              <p>First Name *</p>
              <p>Last Name *</p>
              <p>Email *</p>
            </div>
            <div className="space-y-2 mt-2">
              {[
                { key: 'phone', label: 'Phone' },
                { key: 'zip_code', label: 'Zip Code' },
              ].map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!data.hidden_fields.includes(f.key)}
                    onChange={(e) => {
                      setData((d) => ({
                        ...d,
                        hidden_fields: e.target.checked
                          ? d.hidden_fields.filter((k) => k !== f.key)
                          : [...d.hidden_fields, f.key],
                      }));
                    }}
                    className="rounded border-gray-300"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          {fields.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Custom Fields to Include</h3>
              <div className="space-y-2">
                {fields.map((field) => (
                  <label key={field.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={data.field_ids.includes(field.id)}
                      onChange={() => toggleField(field.id)}
                      className="rounded border-gray-300"
                    />
                    {field.name}
                    <span className="text-gray-400">({field.field_type})</span>
                    {field.is_required && <span className="text-red-500 text-xs">Required</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Welcome Email (optional)</h3>
            <p className="text-xs text-gray-500 mb-3">
              Variables: {'{{first_name}}'}, {'{{last_name}}'}, {'{{email}}'}
            </p>
            <div className="space-y-3">
              <Input
                label="Subject"
                value={data.welcome_email_subject}
                onChange={(e) => setData({ ...data, welcome_email_subject: e.target.value })}
                placeholder="Welcome to the campaign, {{first_name}}!"
              />
              <Textarea
                label="Body (HTML)"
                value={data.welcome_email_body}
                onChange={(e) => setData({ ...data, welcome_email_body: e.target.value })}
                placeholder="<p>Hi {{first_name}},</p><p>Thanks for signing up!</p>"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!data.welcome_email_body.trim()}
                onClick={handlePreview}
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-200">
            <Button type="submit" disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : isNew ? 'Create Form' : 'Save Changes'}
            </Button>
          </div>
        </form>

        {!isNew && form?.slug && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Code className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-medium">Embed Code</h3>
              </div>
              <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto mb-3">
                {embedCode}
              </pre>
              <Button variant="secondary" size="sm" onClick={copyEmbed} className="w-full">
                <Copy className="w-4 h-4 mr-2" />
                {copied ? 'Copied!' : 'Copy Embed Code'}
              </Button>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium mb-2">Preview Link</h3>
              <a
                href={`/embed/${form.slug}`}
                target="_blank"
                className="text-sm text-blue-600 hover:text-blue-800 break-all"
              >
                {appUrl}/embed/{form.slug}
              </a>
            </div>
          </div>
        )}
      </div>

      <Modal open={showPreview} onClose={() => setShowPreview(false)} title="Welcome Email Preview" wide>
        <iframe
          srcDoc={preview}
          sandbox=""
          className="w-full h-96 border border-gray-200 rounded"
        />
      </Modal>
    </div>
  );
}
