import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataFile = process.env.PAGE_VIEW_DATA_FILE || path.join(process.cwd(), "data", "page-views.json");
type PageViewStats = { count: number; lastIp: string; lastVisitedAt: string | null; updatedAt?: string };
let updateQueue: Promise<PageViewStats> = Promise.resolve({ count: 0, lastIp: "—", lastVisitedAt: null });

function normalizeStats(data: Partial<PageViewStats> = {}): PageViewStats {
  return {
    count: Math.max(0, Math.floor(Number(data.count) || 0)),
    lastIp: data.lastIp || "—",
    lastVisitedAt: data.lastVisitedAt || data.updatedAt || null,
    updatedAt: data.updatedAt
  };
}

async function readStats() {
  try {
    return normalizeStats(JSON.parse(await readFile(dataFile, "utf8")));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || error instanceof SyntaxError) return normalizeStats();
    throw error;
  }
}

async function saveStats(stats: PageViewStats) {
  await mkdir(path.dirname(dataFile), { recursive: true });
  const temporaryFile = `${dataFile}.${process.pid}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(stats, null, 2), "utf8");
  await rename(temporaryFile, dataFile);
}

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwarded || realIp || "本机/未知";
}

export async function GET() {
  return NextResponse.json(await readStats(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  updateQueue = updateQueue.catch(() => normalizeStats()).then(async () => {
    const current = await readStats();
    const updatedAt = new Date().toISOString();
    const stats = { count: current.count + 1, lastIp: getClientIp(request), lastVisitedAt: updatedAt, updatedAt };
    await saveStats(stats);
    return stats;
  });
  return NextResponse.json(await updateQueue, { headers: { "Cache-Control": "no-store" } });
}
