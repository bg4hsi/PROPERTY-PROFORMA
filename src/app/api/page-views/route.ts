import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataFile = process.env.PAGE_VIEW_DATA_FILE || path.join(process.cwd(), "data", "page-views.json");
type VisitRecord = { ip: string; visitedAt: string };
type PageViewStats = { count: number; lastIp: string; lastVisitedAt: string | null; recentVisits: VisitRecord[]; updatedAt?: string };
let updateQueue: Promise<PageViewStats> = Promise.resolve({ count: 0, lastIp: "—", lastVisitedAt: null, recentVisits: [] });

function normalizeStats(data: Partial<PageViewStats & { recentVisits?: VisitRecord[] }> = {}): PageViewStats {
  const legacyVisit = data.lastIp && (data.lastVisitedAt || data.updatedAt)
    ? [{ ip: data.lastIp, visitedAt: data.lastVisitedAt || data.updatedAt! }]
    : [];
  const recentVisits = (Array.isArray(data.recentVisits) && data.recentVisits.length ? data.recentVisits : legacyVisit)
    .filter(visit => visit?.ip && visit?.visitedAt)
    .slice(0, 3);
  const latest = recentVisits[0];
  return {
    count: Math.max(0, Math.floor(Number(data.count) || 0)),
    lastIp: latest?.ip || data.lastIp || "—",
    lastVisitedAt: latest?.visitedAt || data.lastVisitedAt || data.updatedAt || null,
    recentVisits,
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

function cleanIp(value: string | null) {
  if (!value) return "";
  return value.trim().replace(/^::ffff:/, "");
}

function displayIp(value: string) {
  if (["::1", "127.0.0.1", "localhost"].includes(value)) return "本机访问";
  return value || "本机/未知";
}

function getClientIp(request: NextRequest) {
  const candidates = [
    ...(request.headers.get("x-forwarded-for") || "").split(","),
    request.headers.get("x-real-ip"),
    request.headers.get("cf-connecting-ip"),
    request.headers.get("true-client-ip"),
    request.headers.get("x-client-ip"),
    request.headers.get("x-vercel-forwarded-for")
  ].map(cleanIp).filter(Boolean);
  const preferred = candidates.find(ip => !["::1", "127.0.0.1", "localhost"].includes(ip)) || candidates[0] || "";
  return displayIp(preferred);
}

export async function GET() {
  return NextResponse.json(await readStats(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  updateQueue = updateQueue.catch(() => normalizeStats()).then(async () => {
    const current = await readStats();
    const updatedAt = new Date().toISOString();
    const ip = getClientIp(request);
    const recentVisits = [{ ip, visitedAt: updatedAt }, ...current.recentVisits].slice(0, 3);
    const stats = { count: current.count + 1, lastIp: ip, lastVisitedAt: updatedAt, recentVisits, updatedAt };
    await saveStats(stats);
    return stats;
  });
  return NextResponse.json(await updateQueue, { headers: { "Cache-Control": "no-store" } });
}
