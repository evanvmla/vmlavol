export function normalizeEditorOutput(html: string, isEmpty: boolean): string {
  return isEmpty ? '' : html;
}
