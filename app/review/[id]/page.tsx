import type { Metadata } from "next";
import { Suspense } from "react";
import Reviewer, { ReviewerLoading } from "./reviewer";

export const metadata: Metadata = { title: "Review a blueprint · Protostar" };

/** Reads the route param. Under cacheComponents, params is runtime data, so it sits behind Suspense. */
async function ReviewerForLink({ params }: { params: PageProps<"/review/[id]">["params"] }) {
  const { id } = await params;
  return <Reviewer reviewId={id} />;
}

/** Reviewer link. The id is the review token, never the session id (ADR 0011). */
export default function ReviewPage({ params }: PageProps<"/review/[id]">) {
  return (
    <Suspense fallback={<ReviewerLoading />}>
      <ReviewerForLink params={params} />
    </Suspense>
  );
}
