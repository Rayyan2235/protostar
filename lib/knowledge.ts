/** Loads the public page snapshots in knowledge/ (ADR 0004). */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface KnowledgePage {
  id: string;
  title: string;
  url: string;
  fetchedAt: string;
  dataLevel: number;
  text: string;
}

const DIR = path.join(process.cwd(), "knowledge");

function parse(file: string): KnowledgePage {
  const raw = readFileSync(path.join(DIR, file), "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`knowledge/${file} has no front matter`);
  const meta = Object.fromEntries(
    m[1].split("\n").map((line) => {
      const i = line.indexOf(":");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"(.*)"$/, "$1")];
    }),
  );
  return {
    id: meta.id, title: meta.title, url: meta.url, fetchedAt: meta.fetchedAt,
    dataLevel: Number(meta.dataLevel ?? 1), text: m[2].trim(),
  };
}

let cache: KnowledgePage[] | undefined;

export function loadKnowledge(): KnowledgePage[] {
  cache ??= readdirSync(DIR).filter((f) => f.endsWith(".md")).sort().map(parse);
  return cache;
}
