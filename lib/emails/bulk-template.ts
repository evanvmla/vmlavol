export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in variables) {
      return variables[key];
    }
    console.warn(`Template variable not found: ${key}`);
    return match;
  });
}

export function renderBulkEmail(
  template: string,
  volunteer: { first_name: string; last_name: string; email: string }
): string {
  return renderTemplate(template, {
    first_name: escapeHtml(volunteer.first_name),
    last_name: escapeHtml(volunteer.last_name),
    email: escapeHtml(volunteer.email),
  });
}
