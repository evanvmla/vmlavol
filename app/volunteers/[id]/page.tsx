'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { InteractionTimeline } from '@/components/volunteers/InteractionTimeline';
import type { Volunteer, CustomField } from '@/lib/types';

export default function VolunteerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === 'new';

  const [volunteer, setVolunteer] = useState<Partial<Volunteer>>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    zip_code: '',
    status: 'active',
    tags: [],
    notes: '',
    custom_data: {},
  });
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    fetch('/api/fields').then((r) => r.json()).then(setFields);
    if (!isNew) {
      fetch(`/api/volunteers/${id}`)
        .then((r) => r.json())
        .then((data) => {
          setVolunteer(data);
          setLoading(false);
        });
    }
  }, [id, isNew]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const method = isNew ? 'POST' : 'PATCH';
    const url = isNew ? '/api/volunteers' : `/api/volunteers/${id}`;

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(volunteer),
    });

    if (res.ok) {
      const data = await res.json();
      if (isNew) {
        router.push(`/volunteers/${data.id}`);
      } else {
        setVolunteer(data);
      }
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this volunteer?')) return;
    const res = await fetch(`/api/volunteers/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to delete volunteer');
      return;
    }
    router.push('/volunteers');
  }

  function addTag() {
    const tag = tagInput.trim();
    if (tag && !(volunteer.tags || []).includes(tag)) {
      setVolunteer({ ...volunteer, tags: [...(volunteer.tags || []), tag] });
      setTagInput('');
    }
  }

  function removeTag(tag: string) {
    setVolunteer({
      ...volunteer,
      tags: (volunteer.tags || []).filter((t) => t !== tag),
    });
  }

  function updateCustomData(key: string, value: unknown) {
    setVolunteer({
      ...volunteer,
      custom_data: { ...(volunteer.custom_data || {}), [key]: value },
    });
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <PageHeader
        title={isNew ? 'Add Volunteer' : `${volunteer.first_name} ${volunteer.last_name}`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push('/volunteers')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            {!isNew && (
              <Button variant="danger" onClick={handleDelete}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="flex gap-6 items-start">
      <form onSubmit={handleSave} className="bg-white rounded-lg border border-gray-200 p-6 space-y-6 w-full max-w-lg shrink-0">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="First Name"
            value={volunteer.first_name || ''}
            onChange={(e) => setVolunteer({ ...volunteer, first_name: e.target.value })}
            required
          />
          <Input
            label="Last Name"
            value={volunteer.last_name || ''}
            onChange={(e) => setVolunteer({ ...volunteer, last_name: e.target.value })}
            required
          />
        </div>

        <Input
          label="Email"
          type="email"
          value={volunteer.email || ''}
          onChange={(e) => setVolunteer({ ...volunteer, email: e.target.value })}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Phone"
            value={volunteer.phone || ''}
            onChange={(e) => setVolunteer({ ...volunteer, phone: e.target.value })}
          />
          <Input
            label="Zip Code"
            value={volunteer.zip_code || ''}
            onChange={(e) => setVolunteer({ ...volunteer, zip_code: e.target.value })}
          />
        </div>

        <Select
          label="Status"
          value={volunteer.status || 'active'}
          onChange={(e) => setVolunteer({ ...volunteer, status: e.target.value as Volunteer['status'] })}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'do_not_contact', label: 'Do Not Contact' },
          ]}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
          <div className="flex gap-1 flex-wrap mb-2">
            {(volunteer.tags || []).map((tag) => (
              <Badge key={tag} color="purple">
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="ml-1 hover:text-red-600">
                  x
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              placeholder="Add tag..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
            <Button type="button" variant="secondary" size="sm" onClick={addTag}>
              Add
            </Button>
          </div>
        </div>

        <Textarea
          label="Notes"
          value={volunteer.notes || ''}
          onChange={(e) => setVolunteer({ ...volunteer, notes: e.target.value })}
        />

        {fields.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Custom Fields</h3>
            <div className="space-y-3">
              {fields.map((field) => {
                const value = (volunteer.custom_data || {})[field.key] as string || '';
                if (field.field_type === 'checkbox') {
                  return (
                    <label key={field.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!((volunteer.custom_data || {})[field.key])}
                        onChange={(e) => updateCustomData(field.key, e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      {field.name}
                    </label>
                  );
                }
                if (field.field_type === 'select') {
                  return (
                    <Select
                      key={field.id}
                      label={field.name}
                      value={value}
                      onChange={(e) => updateCustomData(field.key, e.target.value)}
                      options={[
                        { value: '', label: 'Select...' },
                        ...((field.options || []) as string[]).map((o) => ({ value: o, label: o })),
                      ]}
                    />
                  );
                }
                if (field.field_type === 'textarea') {
                  return (
                    <Textarea
                      key={field.id}
                      label={field.name}
                      value={value}
                      onChange={(e) => updateCustomData(field.key, e.target.value)}
                    />
                  );
                }
                return (
                  <Input
                    key={field.id}
                    label={field.name}
                    type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                    value={value}
                    onChange={(e) => updateCustomData(field.key, e.target.value)}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-4 border-t border-gray-200">
          <Button type="submit" disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : isNew ? 'Create Volunteer' : 'Save Changes'}
          </Button>
        </div>
      </form>

      {!isNew && (
        <div className="flex-1 min-w-0">
          <InteractionTimeline volunteerId={id} />
        </div>
      )}
      </div>
    </div>
  );
}
