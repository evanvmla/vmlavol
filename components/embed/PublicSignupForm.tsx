'use client';

import { useState } from 'react';
import type { CustomField } from '@/lib/types';

export function PublicSignupForm({
  slug,
  name,
  description,
  confirmationMessage,
  hiddenFields,
  customFields,
}: {
  slug: string;
  name: string;
  description: string | null;
  confirmationMessage: string | null;
  hiddenFields: string[];
  customFields: CustomField[];
}) {
  const [formData, setFormData] = useState<Record<string, string>>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    zip_code: '',
  });
  const [customData, setCustomData] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Validate multiselect required fields (not covered by native form validation)
    for (const field of customFields) {
      if (field.is_required && field.field_type === 'multiselect') {
        const val = customData[field.key] as string[] | undefined;
        if (!val || val.length === 0) {
          setError(`${field.name} is required`);
          return;
        }
      }
    }

    setSubmitting(true);

    try {
      const res = await fetch(`/api/submit/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          custom_data: customData,
          _hp: (document.getElementById('_hp') as HTMLInputElement)?.value || '',
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error || 'Something went wrong');
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError('Failed to submit. Please try again.');
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3">&#10003;</div>
        {confirmationMessage ? (
          <p className="text-gray-700 whitespace-pre-line">{confirmationMessage}</p>
        ) : (
          <>
            <h2 className="text-xl font-semibold mb-1">Thank you!</h2>
            <p className="text-gray-500">Your signup has been received.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">{name}</h2>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Honeypot - hidden from real users, only bots fill this */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
          <input type="text" name="website_url" id="_hp" tabIndex={-1} autoComplete="new-password" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
            <input
              type="text"
              required
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
            <input
              type="text"
              required
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
          <input
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {(!hiddenFields.includes('phone') || !hiddenFields.includes('zip_code')) && (
          <div className="grid grid-cols-2 gap-3">
            {!hiddenFields.includes('phone') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            )}
            {!hiddenFields.includes('zip_code') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zip Code</label>
                <input
                  type="text"
                  value={formData.zip_code}
                  onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>
        )}

        {customFields.map((field) => (
          <div key={field.id}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.name} {field.is_required && '*'}
            </label>
            {field.field_type === 'checkbox' ? (
              <input
                type="checkbox"
                checked={!!customData[field.key]}
                onChange={(e) => setCustomData({ ...customData, [field.key]: e.target.checked })}
                className="rounded border-gray-300"
              />
            ) : field.field_type === 'select' ? (
              <select
                required={field.is_required}
                value={(customData[field.key] as string) || ''}
                onChange={(e) => setCustomData({ ...customData, [field.key]: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                {((field.options || []) as string[]).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : field.field_type === 'multiselect' ? (
              <div className="space-y-1.5">
                {((field.options || []) as string[]).map((opt) => {
                  const selected = (customData[field.key] as string[]) || [];
                  return (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(opt)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...selected, opt]
                            : selected.filter((v) => v !== opt);
                          setCustomData({ ...customData, [field.key]: next });
                        }}
                        className="rounded border-gray-300"
                      />
                      {opt}
                    </label>
                  );
                })}
                {field.is_required && (customData[field.key] as string[] | undefined)?.length === 0 && (
                  <p className="text-xs text-red-500">Please select at least one option.</p>
                )}
              </div>
            ) : field.field_type === 'textarea' ? (
              <textarea
                required={field.is_required}
                value={(customData[field.key] as string) || ''}
                onChange={(e) => setCustomData({ ...customData, [field.key]: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                rows={3}
              />
            ) : (
              <input
                type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : field.field_type === 'email' ? 'email' : 'text'}
                required={field.is_required}
                value={(customData[field.key] as string) || ''}
                onChange={(e) => setCustomData({ ...customData, [field.key]: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            )}
          </div>
        ))}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Submitting...' : 'Sign Up'}
        </button>
      </form>
    </div>
  );
}
