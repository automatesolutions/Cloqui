"use client"

import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import { Bold, Italic, List, ListOrdered, Quote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Task description editor. Content is stored as Tiptap JSON (never HTML), so there is nothing
 * to sanitize and no way to inject markup. Saves when the editor loses focus.
 */
export function RichText({
  value,
  onSave,
  label,
}: {
  value: Record<string, unknown> | null
  onSave: (doc: Record<string, unknown>) => void
  label: string
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        codeBlock: false,
        horizontalRule: false,
        link: false,
      }),
      Placeholder.configure({ placeholder: "Add details, links or steps" }),
    ],
    content: value ?? undefined,
    editorProps: {
      attributes: {
        "aria-label": label,
        "aria-multiline": "true",
        role: "textbox",
        class:
          "min-h-28 rounded-b-md border border-t-0 border-input bg-surface px-3 py-2.5 text-callout outline-none focus-visible:outline-2 focus-visible:outline-brand [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-fg-secondary [&_h3]:text-headline [&_ol]:list-decimal [&_ol]:pl-5 [&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:text-fg-muted [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_ul]:list-disc [&_ul]:pl-5",
      },
    },
    onBlur: ({ editor: e }) => onSave(e.getJSON() as Record<string, unknown>),
  })

  const tool = (name: string, run: () => void, Icon: typeof Bold, active: boolean) => (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={name}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={cn(active && "bg-raised text-fg")}
    >
      <Icon />
    </Button>
  )

  return (
    <div>
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex gap-0.5 rounded-t-md border border-input bg-raised px-1 py-0.5"
      >
        {editor && (
          <>
            {tool(
              "Bold",
              () => editor.chain().focus().toggleBold().run(),
              Bold,
              editor.isActive("bold")
            )}
            {tool(
              "Italic",
              () => editor.chain().focus().toggleItalic().run(),
              Italic,
              editor.isActive("italic")
            )}
            {tool(
              "Bulleted list",
              () => editor.chain().focus().toggleBulletList().run(),
              List,
              editor.isActive("bulletList")
            )}
            {tool(
              "Numbered list",
              () => editor.chain().focus().toggleOrderedList().run(),
              ListOrdered,
              editor.isActive("orderedList")
            )}
            {tool(
              "Quote",
              () => editor.chain().focus().toggleBlockquote().run(),
              Quote,
              editor.isActive("blockquote")
            )}
          </>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
