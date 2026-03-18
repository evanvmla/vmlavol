import { escapeHtml, renderTemplate } from './bulk-template';

export function renderWelcomeEmail(
  template: string,
  volunteer: { first_name: string; last_name: string; email: string }
): string {
  return renderTemplate(template, {
    first_name: escapeHtml(volunteer.first_name),
    last_name: escapeHtml(volunteer.last_name),
    email: escapeHtml(volunteer.email),
  });
}
