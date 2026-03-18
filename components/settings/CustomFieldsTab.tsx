'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Table, Thead, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Trash2, Plus, GripVertical } from 'lucide-react';
import type { CustomField } from '@/lib/types';

const fieldTypes = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multiselect', label: 'Multi-Select' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
];

export function CustomFieldsTab() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    field_type: 'text',
    options: '',
    is_required: false,
  });

  useEffect(() => {
    fetchFields();
  }, []);

  async function fetchFields() {
    const res = await fetch('/api/fields');
    const data = await res.json();
    setFields(data);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const options =
      ['select', 'multiselect'].includes(form.field_type) && form.options
        ? form.options.split(',').map((o) => o.trim()).filter(Boolean)
        : null;

    const res = await fetch('/api/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, options }),
    });

    if (res.ok) {
      setShowModal(false);
      setForm({ name: '', field_type: 'text', options: '', is_required: false });
      fetchFields();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this field? It will be removed from all forms.')) return;
    await fetch(`/api/fields/${id}`, { method: 'DELETE' });
    fetchFields();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Define custom data fields for volunteer profiles</p>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Field
        </Button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : fields.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">No custom fields yet. Create one to get started.</p>
        </div>
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th />
              <Th>Name</Th>
              <Th>Key</Th>
              <Th>Type</Th>
              <Th>Required</Th>
              <Th>Options</Th>
              <Th />
            </tr>
          </Thead>
          <tbody className="divide-y divide-gray-200">
            {fields.map((field) => (
              <tr key={field.id} className="hover:bg-gray-50">
                <Td>
                  <GripVertical className="w-4 h-4 text-gray-400" />
                </Td>
                <Td className="font-medium">{field.name}</Td>
                <Td>
                  <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                    {field.key}
                  </code>
                </Td>
                <Td>
                  <Badge color="blue">{field.field_type}</Badge>
                </Td>
                <Td>{field.is_required ? 'Yes' : 'No'}</Td>
                <Td>
                  {field.options
                    ? (field.options as string[]).join(', ')
                    : '-'}
                </Td>
                <Td>
                  <button
                    onClick={() => handleDelete(field.id)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Custom Field">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Field Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. T-Shirt Size"
            required
          />
          <Select
            label="Field Type"
            value={form.field_type}
            onChange={(e) => setForm({ ...form, field_type: e.target.value })}
            options={fieldTypes}
          />
          {['select', 'multiselect'].includes(form.field_type) && (
            <Input
              label="Options (comma-separated)"
              value={form.options}
              onChange={(e) => setForm({ ...form, options: e.target.value })}
              placeholder="Small, Medium, Large, XL"
              required
            />
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_required}
              onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
              className="rounded border-gray-300"
            />
            Required field
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Field</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
