'use client';

import React, { useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';

// --- Pure helper (exported for testing) ---
export function normalizeEditorOutput(html: string, isEmpty: boolean): string {
  return isEmpty ? '' : html;
}

// --- Error boundary ---
class EditorErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.error('RichTextEditor failed to load:', err); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

// --- Toolbar button ---
function TBtn({ active, onClick, children, title }: {
  active?: boolean; onClick: () => void; children: React.ReactNode; title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
      }`}
    >
      {children}
    </button>
  );
}

// --- Main component ---
interface RichTextEditorProps {
  initialValue: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function RichTextEditorInner({ initialValue, onChange, placeholder }: RichTextEditorProps) {
  const [htmlMode, setHtmlMode] = useState(false);
  const [rawHtml, setRawHtml] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({ placeholder: placeholder || 'Start writing...' }),
    ],
    content: initialValue || '',
    onUpdate: ({ editor: e }) => {
      onChange(normalizeEditorOutput(e.getHTML(), e.isEmpty));
    },
  });

  const switchToHtml = useCallback(() => {
    if (!editor) return;
    setRawHtml(editor.getHTML());
    setHtmlMode(true);
  }, [editor]);

  const switchToRichText = useCallback(() => {
    if (!editor) return;
    if (!confirm('Switching to rich text may remove unsupported HTML formatting. Continue?')) return;
    editor.commands.setContent(rawHtml);
    onChange(normalizeEditorOutput(editor.getHTML(), editor.isEmpty));
    setHtmlMode(false);
  }, [editor, rawHtml, onChange]);

  const handleRawHtmlChange = useCallback((val: string) => {
    setRawHtml(val);
    onChange(val);
  }, [onChange]);

  const insertVariable = useCallback((variable: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(variable).run();
  }, [editor]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const url = prompt('Enter URL:');
    if (!url) return;
    editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 flex-wrap border-b border-gray-100 pb-2 mb-2">
        <TBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <strong>B</strong>
        </TBtn>
        <TBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <em>I</em>
        </TBtn>
        <TBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
          <span className="underline">U</span>
        </TBtn>

        <span className="w-px h-5 bg-gray-200 mx-1" />

        <TBtn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
          H1
        </TBtn>
        <TBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
          H2
        </TBtn>

        <span className="w-px h-5 bg-gray-200 mx-1" />

        <TBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          &bull; List
        </TBtn>
        <TBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Ordered list">
          1. List
        </TBtn>
        <TBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">
          &ldquo; Quote
        </TBtn>
        <TBtn active={editor.isActive('link')} onClick={addLink} title="Insert link">
          Link
        </TBtn>

        <span className="w-px h-5 bg-gray-200 mx-1" />

        {/* Template variables */}
        <TBtn onClick={() => insertVariable('{{first_name}}')} title="Insert first name">
          {'{{first_name}}'}
        </TBtn>
        <TBtn onClick={() => insertVariable('{{last_name}}')} title="Insert last name">
          {'{{last_name}}'}
        </TBtn>
        <TBtn onClick={() => insertVariable('{{email}}')} title="Insert email">
          {'{{email}}'}
        </TBtn>

        {/* HTML toggle — push to far right */}
        <div className="ml-auto">
          <TBtn
            active={htmlMode}
            onClick={htmlMode ? switchToRichText : switchToHtml}
            title={htmlMode ? 'Switch to rich text' : 'Switch to HTML'}
          >
            {'</>'}
          </TBtn>
        </div>
      </div>

      {/* Editor / HTML textarea */}
      {htmlMode ? (
        <textarea
          className="w-full min-h-[240px] border border-gray-200 rounded bg-gray-50 text-sm font-mono p-3 focus:ring-1 focus:ring-blue-300 focus:border-blue-300 focus:outline-none resize-y"
          value={rawHtml}
          onChange={e => handleRawHtmlChange(e.target.value)}
        />
      ) : (
        <EditorContent
          editor={editor}
          className="rich-text-editor min-h-[240px] border border-gray-200 rounded px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-blue-300 focus-within:border-blue-300 cursor-text"
        />
      )}
    </div>
  );
}

export default function RichTextEditor(props: RichTextEditorProps) {
  return (
    <EditorErrorBoundary
      fallback={
        <textarea
          className="w-full min-h-[240px] border border-gray-200 rounded text-sm p-3 focus:ring-1 focus:ring-blue-300 focus:outline-none resize-y"
          defaultValue={props.initialValue}
          onChange={e => props.onChange(e.target.value)}
          placeholder={props.placeholder}
        />
      }
    >
      <RichTextEditorInner {...props} />
    </EditorErrorBoundary>
  );
}
