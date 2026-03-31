'use client';

import { Plus, X } from 'lucide-react';
import type { CustomField, Form } from '@/lib/types';
import type { FilterRule } from '@/lib/filter-volunteers';

interface RecipientFilterProps {
  rules: FilterRule[];
  onChange: (rules: FilterRule[]) => void;
  customFields: CustomField[];
  forms: Form[];
}

const STANDARD_FIELDS = [
  { value: 'tags', label: 'Tags' },
  { value: 'source_form_id', label: 'Source Form' },
  { value: 'zip_code', label: 'Zip Code' },
  { value: 'phone', label: 'Phone' },
];

function getOperators(field: string, customFields: CustomField[]) {
  if (field === 'tags') {
    return [
      { value: 'contains', label: 'includes tag' },
      { value: 'not_contains', label: 'excludes tag' },
    ];
  }
  if (field === 'source_form_id') {
    return [
      { value: 'equals', label: 'is' },
      { value: 'not_equals', label: 'is not' },
      { value: 'is_empty', label: 'is not set' },
      { value: 'is_not_empty', label: 'is set' },
    ];
  }
  if (field === 'zip_code') {
    return [
      { value: 'equals', label: 'equals' },
      { value: 'contains', label: 'contains' },
      { value: 'is_empty', label: 'is empty' },
      { value: 'is_not_empty', label: 'is not empty' },
    ];
  }
  if (field === 'phone') {
    return [
      { value: 'is_not_empty', label: 'has phone number' },
      { value: 'is_empty', label: 'has no phone number' },
    ];
  }
  if (field.startsWith('custom:')) {
    const key = field.slice(7);
    const cf = customFields.find(f => f.key === key);
    switch (cf?.field_type) {
      case 'multiselect':
        return [
          { value: 'contains', label: 'includes' },
          { value: 'not_contains', label: 'does not include' },
        ];
      case 'checkbox':
        return [{ value: 'equals', label: 'is' }];
      case 'select':
        return [
          { value: 'equals', label: 'is' },
          { value: 'not_equals', label: 'is not' },
          { value: 'is_empty', label: 'is not set' },
        ];
      default:
        return [
          { value: 'contains', label: 'contains' },
          { value: 'equals', label: 'equals' },
          { value: 'is_empty', label: 'is empty' },
          { value: 'is_not_empty', label: 'is not empty' },
        ];
    }
  }
  return [{ value: 'equals', label: 'equals' }];
}

const selectCls =
  'block rounded-lg border border-gray-300 px-2.5 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white';
const inputCls =
  'block rounded-lg border border-gray-300 px-2.5 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full';

function ValueInput({
  rule,
  customFields,
  forms,
  onChange,
}: {
  rule: FilterRule;
  customFields: CustomField[];
  forms: Form[];
  onChange: (value: string) => void;
}) {
  const { field, operator, value } = rule;

  const noValueNeeded =
    ['is_empty', 'is_not_empty'].includes(operator) || field === 'phone';
  if (noValueNeeded) return null;

  if (field === 'source_form_id') {
    return (
      <select
        className={`${selectCls} flex-1 min-w-0`}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">Select form…</option>
        {forms.map(f => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    );
  }

  if (field.startsWith('custom:')) {
    const key = field.slice(7);
    const cf = customFields.find(f => f.key === key);

    if (cf?.field_type === 'checkbox') {
      return (
        <select
          className={`${selectCls} flex-1 min-w-0`}
          value={value || 'true'}
          onChange={e => onChange(e.target.value)}
        >
          <option value="true">Yes / Checked</option>
          <option value="false">No / Unchecked</option>
        </select>
      );
    }

    if (
      (cf?.field_type === 'select' || cf?.field_type === 'multiselect') &&
      cf.options?.length
    ) {
      return (
        <select
          className={`${selectCls} flex-1 min-w-0`}
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {cf.options.map(opt => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }
  }

  return (
    <input
      type="text"
      className={`${inputCls} flex-1 min-w-0`}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="Value…"
    />
  );
}

function newRule(): FilterRule {
  return {
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}`,
    field: 'tags',
    operator: 'contains',
    value: '',
    logic: 'AND',
  };
}

export function RecipientFilter({
  rules,
  onChange,
  customFields,
  forms,
}: RecipientFilterProps) {
  function updateRule(id: string, patch: Partial<Omit<FilterRule, 'id'>>) {
    onChange(
      rules.map(r => {
        if (r.id !== id) return r;
        const updated = { ...r, ...patch };
        if (patch.field !== undefined) {
          const ops = getOperators(patch.field, customFields);
          updated.operator = ops[0].value;
          updated.value = '';
        } else if (patch.operator !== undefined) {
          updated.value = '';
        }
        return updated;
      })
    );
  }

  function removeRule(id: string) {
    onChange(rules.filter(r => r.id !== id));
  }

  function addRule() {
    onChange([...rules, newRule()]);
  }

  return (
    <div className="space-y-2">
      {rules.length === 0 && (
        <p className="text-xs text-gray-400 italic py-1">
          No filters — sending to all active volunteers.
        </p>
      )}

      {rules.map((rule, index) => {
        const operators = getOperators(rule.field, customFields);
        const noValue =
          ['is_empty', 'is_not_empty'].includes(rule.operator) ||
          rule.field === 'phone';

        return (
          <div key={rule.id} className="flex items-center gap-1.5">
            {index === 0 ? (
              <span className="text-xs font-mono text-gray-400 w-12 shrink-0 text-right select-none">
                WHERE
              </span>
            ) : (
              <button
                type="button"
                onClick={() => updateRule(rule.id, { logic: rule.logic === 'OR' ? 'AND' : 'OR' })}
                className={`text-xs font-mono font-semibold w-12 shrink-0 text-right select-none rounded px-1.5 py-0.5 transition-colors ${
                  rule.logic === 'OR'
                    ? 'text-purple-600 bg-purple-50 hover:bg-purple-100'
                    : 'text-gray-400 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                {rule.logic === 'OR' ? 'OR' : 'AND'}
              </button>
            )}

            {/* Field */}
            <select
              className={`${selectCls} w-36 shrink-0`}
              value={rule.field}
              onChange={e => updateRule(rule.id, { field: e.target.value })}
            >
              <optgroup label="Standard">
                {STANDARD_FIELDS.map(f => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
              {customFields.length > 0 && (
                <optgroup label="Custom Fields">
                  {customFields.map(cf => (
                    <option key={cf.key} value={`custom:${cf.key}`}>
                      {cf.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            {/* Operator */}
            <select
              className={`${selectCls} w-36 shrink-0`}
              value={rule.operator}
              onChange={e => updateRule(rule.id, { operator: e.target.value })}
            >
              {operators.map(op => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            {/* Value */}
            {!noValue ? (
              <ValueInput
                rule={rule}
                customFields={customFields}
                forms={forms}
                onChange={v => updateRule(rule.id, { value: v })}
              />
            ) : (
              <div className="flex-1" />
            )}

            {/* Remove */}
            <button
              type="button"
              onClick={() => removeRule(rule.id)}
              className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors shrink-0"
              aria-label="Remove condition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRule}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium pt-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Condition
      </button>
    </div>
  );
}
