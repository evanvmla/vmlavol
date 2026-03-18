import { renderTemplate, escapeHtml, renderBulkEmail } from '@/lib/emails/bulk-template';

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('renderTemplate', () => {
  it('replaces template variables', () => {
    const result = renderTemplate('Hello {{first_name}} {{last_name}}!', {
      first_name: 'Jane',
      last_name: 'Doe',
    });
    expect(result).toBe('Hello Jane Doe!');
  });

  it('leaves unknown variables as-is and warns', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const result = renderTemplate('Hello {{unknown}}!', {});
    expect(result).toBe('Hello {{unknown}}!');
    expect(warnSpy).toHaveBeenCalledWith('Template variable not found: unknown');
    warnSpy.mockRestore();
  });

  it('handles empty template', () => {
    expect(renderTemplate('', { first_name: 'Jane' })).toBe('');
  });

  it('handles template with no variables', () => {
    expect(renderTemplate('No variables here', {})).toBe('No variables here');
  });

  it('replaces multiple occurrences of the same variable', () => {
    const result = renderTemplate('{{name}} and {{name}}', { name: 'Bob' });
    expect(result).toBe('Bob and Bob');
  });
});

describe('renderBulkEmail', () => {
  it('renders and HTML-escapes volunteer data', () => {
    const result = renderBulkEmail('<p>Hello {{first_name}}!</p>', {
      first_name: '<b>Evil</b>',
      last_name: 'User',
      email: 'test@example.com',
    });
    expect(result).toBe('<p>Hello &lt;b&gt;Evil&lt;/b&gt;!</p>');
  });

  it('escapes all volunteer fields', () => {
    const result = renderBulkEmail('{{email}}', {
      first_name: 'A',
      last_name: 'B',
      email: 'a&b@test.com',
    });
    expect(result).toBe('a&amp;b@test.com');
  });
});
