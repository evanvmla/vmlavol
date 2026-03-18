import type { CustomField } from './types';

export interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFilterRules(query: any, rules: FilterRule[], customFields: CustomField[] = []): any {
  for (const rule of rules) {
    const { field, operator, value } = rule;
    if (!field || !operator) continue;

    if (field === 'tags') {
      if (operator === 'contains' && value) {
        query = query.contains('tags', [value]);
      } else if (operator === 'not_contains' && value) {
        query = query.not('tags', 'cs', `{"${value}"}`);
      }
    } else if (field === 'source_form_id') {
      if (operator === 'equals' && value) {
        query = query.eq('source_form_id', value);
      } else if (operator === 'not_equals' && value) {
        query = query.neq('source_form_id', value);
      } else if (operator === 'is_empty') {
        query = query.is('source_form_id', null);
      } else if (operator === 'is_not_empty') {
        query = query.not('source_form_id', 'is', null);
      }
    } else if (field === 'zip_code') {
      if (operator === 'equals' && value) {
        query = query.eq('zip_code', value);
      } else if (operator === 'contains' && value) {
        query = query.ilike('zip_code', `%${value}%`);
      } else if (operator === 'is_empty') {
        query = query.is('zip_code', null);
      } else if (operator === 'is_not_empty') {
        query = query.not('zip_code', 'is', null);
      }
    } else if (field === 'phone') {
      if (operator === 'is_empty') {
        query = query.is('phone', null);
      } else if (operator === 'is_not_empty') {
        query = query.not('phone', 'is', null);
      }
    } else if (field.startsWith('custom:')) {
      const fieldKey = field.slice(7);
      const cf = customFields.find(f => f.key === fieldKey);
      const fieldType = cf?.field_type || 'text';

      if (operator === 'is_empty') {
        query = query.or(`custom_data->>${fieldKey}.is.null,custom_data->>${fieldKey}.eq.`);
      } else if (operator === 'is_not_empty') {
        query = query.not(`custom_data->>${fieldKey}`, 'is', null);
      } else if (fieldType === 'multiselect') {
        if (operator === 'contains' && value) {
          query = query.filter(`custom_data->${fieldKey}`, 'cs', JSON.stringify([value]));
        } else if (operator === 'not_contains' && value) {
          query = query.not(`custom_data->${fieldKey}`, 'cs', JSON.stringify([value]));
        }
      } else if (fieldType === 'checkbox') {
        if (operator === 'equals') {
          query = query.filter(`custom_data->>${fieldKey}`, 'eq', value);
        }
      } else {
        // text, textarea, select, email, phone, number, date
        if (operator === 'equals' && value) {
          query = query.filter(`custom_data->>${fieldKey}`, 'eq', value);
        } else if (operator === 'not_equals' && value) {
          query = query.not(`custom_data->>${fieldKey}`, 'eq', value);
        } else if (operator === 'contains' && value) {
          query = query.filter(`custom_data->>${fieldKey}`, 'ilike', `%${value}%`);
        }
      }
    }
  }

  return query;
}
