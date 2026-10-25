import { Clock } from "lucide-react"
import { EmptyState } from "./empty-state"
import { PageHeader } from "./page-header"

/** Honest placeholder for sections that aren't built yet. Never advertised as working. */
export function ComingLater({ title, body }: { title: string; body: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={Clock} title="Coming later" body={body} />
    </>
  )
}
