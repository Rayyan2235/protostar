import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Button } from "@/components/kiln/Button";
import { Tag } from "@/components/kiln/Tag";
import { SpecSheet } from "@/components/kiln/SpecSheet";
import { TopBar } from "@/components/TopBar";
import { TextField } from "@/components/TextField";
import { EmptyState } from "@/components/EmptyState";
import { Figure } from "@/components/Figure";
import { FlowRail } from "@/components/FlowRail";
import { KeyHint } from "@/components/Kbd";
import { Notice } from "@/components/Notice";
import { ChoiceList } from "@/components/ChoiceList";

export const metadata: Metadata = { title: "Kiln parts · Protostar" };

/** Dev-only preview of every Kiln part in this repo (plan-kiln K2). Not shipped. */
export default function KilnPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <>
      <TopBar title="Protostar" subtitle="Kiln parts · dev preview" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-(--space-6) px-(--space-3) py-(--space-5) sm:px-(--space-6)">
        <Section name="Button">
          <div className="flex flex-wrap items-center gap-(--space-3)">
            <Button>Submit for review</Button>
            <Button kind="outline">Change scope</Button>
            <Button kind="outline" href="https://example.org" external>Open the bulletin</Button>
            <Button kind="link">Skip to the blueprint</Button>
            <Button disabled>Sending</Button>
            <Button danger>Reject v2</Button>
          </div>
        </Section>

        <Section name="Tag">
          <div className="flex flex-wrap gap-(--space-2)">
            <Tag>Level 1 · Public</Tag><Tag>rule</Tag><Tag selected>Recommended</Tag><Tag live>Waiting for review</Tag>
          </div>
        </Section>

        <Section name="SpecSheet">
          <SpecSheet number="SPEC 01" title="[AGENT NAME]" revision="REV [DATE]" rows={[
            { label: "Scope", value: "[SCOPE]" }, { label: "Model", value: "[MODEL]" },
            { label: "Est. cost / month", value: "[ESTIMATE]" }, { label: "Highest data level", value: "[LEVEL]" },
            { label: "Tests", value: "Not run yet" }, { label: "Status", value: "[STATUS]" },
          ]} />
        </Section>

        <Section name="Notice">
          <div className="flex flex-col gap-(--space-3)">
            <Notice>Saved. You can close this tab.</Notice>
            <Notice tone="accent" title="v1 submitted · waiting for review">Send the link to your reviewer.</Notice>
            <Notice tone="success" title="Approved">The reviewer signed off on v2.</Notice>
            <Notice tone="danger" title="Hold on: this would use student records" actions={<Button kind="outline">Keep it anyway</Button>}>
              That counts as Level 3–4 data.
            </Notice>
          </div>
        </Section>

        <Section name="FlowRail · top (scope) and margin">
          <FlowRail variant="top" step="scope" />
          <div className="max-w-xs"><FlowRail variant="margin" /></div>
        </Section>

        <Section name="Kbd · KeyHint">
          <KeyHint items={[["Enter", "to send"], ["Shift + Enter", "for a new line"]]} />
        </Section>

        <Section name="Figure (static)">
          <p className="title text-ink">≈ <Figure value={112} format={(n) => `$${Math.round(n)}`} /> <span className="small font-normal text-ink-muted">[ESTIMATE NOTE]</span></p>
        </Section>

        <Section name="EmptyState">
          <EmptyState mark="Not found." action={<Button kind="outline" href="/">Go to the start</Button>}>[ONE SENTENCE THAT SAYS WHAT HAPPENED]</EmptyState>
        </Section>

        <Section name="TextField">
          <div className="grid gap-(--space-3) sm:grid-cols-2">
            <TextField id="pv-a" label="Students per month" type="number" value="400" readOnly />
            <TextField id="pv-b" label="Note to the requester" multiline value="" readOnly error="Say what should change before you request changes." />
          </div>
        </Section>

        <Section name="ChoiceList">
          <ChoiceList label="Scope" value="guided" options={[
            { value: "faq", title: "FAQ only", detail: "[ONE LINE]", meta: "[COST]", marks: <Tag>Low risk</Tag> },
            { value: "guided", title: "Guided eligibility check", detail: "[ONE LINE]", meta: "[COST]", marks: <><Tag>Medium risk</Tag><Tag selected>Recommended</Tag></> },
            { value: "open", title: "Open advising assistant", detail: "[ONE LINE]", meta: "[COST]", marks: <Tag>High risk</Tag> },
          ]} />
        </Section>
      </main>
    </>
  );
}

function Section({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-(--space-3)">
      <h2 className="label text-ink-muted">{name}</h2>
      {children}
    </section>
  );
}
