import { normalizeEditorOutput } from '../lib/normalize-editor-output';

describe('normalizeEditorOutput', () => {
  it('returns empty string when editor is empty', () => {
    expect(normalizeEditorOutput('<p></p>', true)).toBe('');
  });

  it('returns HTML when editor has content', () => {
    expect(normalizeEditorOutput('<p>Hello</p>', false)).toBe('<p>Hello</p>');
  });

  it('returns empty string for any HTML when isEmpty is true', () => {
    expect(normalizeEditorOutput('<p><br></p>', true)).toBe('');
  });
});
