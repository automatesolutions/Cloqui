"use client"

import { useActionState, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FormMessage } from "@/components/forms/field"
import { HeroReveal } from "@/components/motion/hero-reveal"
import { slugify, type FormState } from "@/lib/validation"
import { createWorkspaceAction } from "./actions"

export default function OnboardingPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(createWorkspaceAction, {})
  // Uncontrolled inputs: anything typed before hydration is kept.
  const slugRef = useRef<HTMLInputElement>(null)
  const slugEdited = useRef(false)
  const [preview, setPreview] = useState(state.values?.slug ?? "")

  return (
    <HeroReveal>
      <p data-reveal className="text-footnote font-medium text-brand tnum">
        Step 1 of 2
      </p>
      <h1 data-reveal className="mt-2 text-title-1 font-bold max-md:text-title-2">
        Create your workspace
      </h1>
      <p data-reveal className="mt-2 text-callout text-fg-secondary">
        A private space for your team. Only people you invite can join.
      </p>
      <form data-reveal action={action} className="mt-8 grid gap-5" noValidate>
        <FormMessage message={state.message} />
        <Field
          name="name"
          label="Workspace name"
          placeholder="Acme Design"
          autoComplete="organization"
          required
          defaultValue={state.values?.name}
          onChange={(e) => {
            if (slugEdited.current || !slugRef.current) return
            const next = slugify(e.target.value)
            slugRef.current.value = next
            setPreview(next)
          }}
          error={state.fieldErrors?.name}
        />
        <Field
          ref={slugRef}
          name="slug"
          label="Web address"
          required
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.values?.slug}
          onChange={(e) => {
            slugEdited.current = true
            setPreview(e.target.value.toLowerCase())
          }}
          error={state.fieldErrors?.slug}
          help={
            <>
              Your workspace will be at{" "}
              <span className="font-mono text-fg">/w/{preview || "your-team"}</span>. It still only
              opens for members.
            </>
          }
        />
        <Button type="submit" loading={pending} className="mt-2 w-full">
          Create workspace
        </Button>
      </form>
    </HeroReveal>
  )
}
