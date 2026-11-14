import { Suspense } from "react";
import Studio from "./studio";

/**
 * Reads ?s= on the server so a shared session link renders a busy state, never the idea form first.
 * Under cacheComponents, searchParams is runtime data, so it sits behind Suspense; the fallback is
 * the same busy state.
 */
async function StudioForLink({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { s } = await searchParams;
  return <Studio initialId={typeof s === "string" && s ? s : undefined} />;
}

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<Studio pending />}>
      <StudioForLink searchParams={searchParams} />
    </Suspense>
  );
}
