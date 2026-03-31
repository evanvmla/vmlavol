import type { CustomField } from './types';

export interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: string;
  logic?: 'AND' | 'OR';
}

/**
 * Convert a single rule to PostgREST filter string(s) for use inside .or().
 * Returns an array because custom is_empty produces two conditions (null OR empty).
 */
function ruleToFilterString(rule: FilterRule, customFields: CustomField[]): string[] {
  const { field, operator, value } = rule;

  if (field === 'tags') {
    if (operator === 'contains' && value) return [`tags.cs.{"${value}"}`];
    if (operator === 'not_contains' && value) return [`not.tags.cs.{"${value}"}`];
  } else if (field === 'source_form_id') {
    if (operator === 'equals' && value) return [`source_form_id.eq.${value}`];
    if (operator === 'not_equals' && value) return [`source_form_id.neq.${value}`];
    if (operator === 'is_empty') return [`source_form_id.is.null`];
    if (operator === 'is_not_empty') return [`not.source_form_id.is.null`];
  } else if (field === 'zip_code') {
    if (operator === 'equals' && value) return [`zip_code.eq.${value}`];
    if (operator === 'contains' && value) return [`zip_code.ilike.%${value}%`];
    if (operator === 'is_empty') return [`zip_code.is.null`];
    if (operator === 'is_not_empty') return [`not.zip_code.is.null`];
  } else if (field === 'phone') {
    if (operator === 'is_empty') return [`phone.is.null`];
    if (operator === 'is_not_empty') return [`not.phone.is.null`];
  } else if (field.startsWith('custom:')) {
    const fieldKey = field.slice(7);
    const cf = customFields.find(f => f.key === fieldKey);
    const fieldType = cf?.field_type || 'text';

    if (operator === 'is_empty') {
      return [`custom_data->>${fieldKey}.is.null`, `custom_data->>${fieldKey}.eq.`];
    }
    if (operator === 'is_not_empty') {
      return [`not.custom_data->>${fieldKey}.is.null`];
    }
    if (fieldType === 'multiselect') {
      if (operator === 'contains' && value) return [`custom_data->${fieldKey}.cs.${JSON.stringify([value])}`];
      if (operator === 'not_contains' && value) return [`not.custom_data->${fieldKey}.cs.${JSON.stringify([value])}`];
    } else if (fieldType === 'checkbox') {
      if (operator === 'equals') return [`custom_data->>${fieldKey}.eq.${value}`];
    } else {
      if (operator === 'equals' && value) return [`custom_data->>${fieldKey}.eq.${value}`];
      if (operator === 'not_equals' && value) return [`not.custom_data->>${fieldKey}.eq.${value}`];
      if (operator === 'contains' && value) return [`custom_data->>${fieldKey}.ilike.%${value}%`];
    }
  }

  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySingleRule(query: any, rule: FilterRule, customFields: CustomField[]): any {
  const { field, operator, value } = rule;
  if (!field || !operator) return query;

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
      if (operator === 'equals' && value) {
        query = query.filter(`custom_data->>${fieldKey}`, 'eq', value);
      } else if (operator === 'not_equals' && value) {
        query = query.not(`custom_data->>${fieldKey}`, 'eq', value);
      } else if (operator === 'contains' && value) {
        query = query.filter(`custom_data->>${fieldKey}`, 'ilike', `%${value}%`);
      }
    }
  }

  return query;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFilterRules(query: any, rules: FilterRule[], customFields: CustomField[] = []): any {
  // Group rules into segments: consecutive OR-connected rules form one group.
  // Example: Rule1(WHERE) AND Rule2 OR Rule3 OR Rule4 AND Rule5
  //        → [Rule1] AND [Rule2, Rule3, Rule4] AND [Rule5]
  // Each group is AND'd with the rest. Within an OR group, rules are OR'd via .or().
  const groups: FilterRule[][] = [];

  for (const rule of rules) {
    if (!rule.field || !rule.operator) continue;
    if (rule.logic === 'OR' && groups.length > 0) {
      groups[groups.length - 1].push(rule);
    } else {
      groups.push([rule]);
    }
  }

  for (const group of groups) {
    if (group.length === 1) {
      query = applySingleRule(query, group[0], customFields);
    } else {
      // OR group: combine all rules into a single .or() call
      const filterStrings = group.flatMap(r => ruleToFilterString(r, customFields));
      if (filterStrings.length > 0) {
        query = query.or(filterStrings.join(','));
      }
    }
  }

  return query;
}
