import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataFile = process.env.PAGE_VIEW_DATA_FILE || path.join(process.cwd(), "data", "page-views.json");
let updateQueue: Promise<number> = Promise.resolve(0);

async function readCount() {
  try {
    const data = JSON.parse(await readFile(dataFile, "utf8")) as { count?: number };
    return Math.max(0, Math.floor(Number(data.count) || 0));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || error instanceof SyntaxError) return 0;
    throw error;
  }
}

async function saveCount(count: number) {
  await mkdir(path.dirname(dataFile), { recursive: true });
  const temporaryFile = `${dataFile}.${process.pid}.tmp`;
  await writeFile(temporaryFile, JSON.stringify({ count, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  await rename(temporaryFile, dataFile);
}

export async function GET() {
  return NextResponse.json({ count: await readCount() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  updateQueue = updateQueue.catch(() => 0).then(async () => {
    const count = await readCount() + 1;
    await saveCount(count);
    return count;
  });
  return NextResponse.json({ count: await updateQueue }, { headers: { "Cache-Control": "no-store" } });
}
