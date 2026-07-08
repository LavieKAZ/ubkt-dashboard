import { Toaster } from "sonner";
import { MacosDock } from "@/components/nghi-quyet/macos-dock";
import { normalizeStatus, TargetTable, type ProgramNode, type ResolutionNode, type TargetNode, type UserRole } from "@/components/nghi-quyet/target-table";
import { createClient } from "@/lib/supabase/server";

type RawRecord = Record<string, unknown>;

function readString(record: RawRecord, keys: string[], fallback: string) { for (const key of keys) { const value = record[key]; if (typeof value === "string" && value.trim()) return value; } return fallback; }
function readNullableString(record: RawRecord, keys: string[]) { for (const key of keys) { const value = record[key]; if (typeof value === "string" && value.trim()) return value; } return null; }
function readNumber(record: RawRecord, keys: string[], fallback: number) { for (const key of keys) { const value = record[key]; const numberValue = typeof value === "number" ? value : Number(value); if (!Number.isNaN(numberValue)) return Math.min(100, Math.max(0, numberValue)); } return fallback; }
function normalizeRole(value: unknown): UserRole { const role = String(value ?? "").trim().toLowerCase(); if (["executive", "admin", "super_admin", "dieu_hanh", "điều hành"].includes(role)) return "executive"; if (["sector", "nganh", "ngành"].includes(role)) return "sector"; return "unit"; }
function normalizeResolution(record: RawRecord): ResolutionNode { return { id: readString(record, ["id"], crypto.randomUUID()), name: readString(record, ["name", "title", "ten_nghi_quyet", "ten"], "Nghị quyết chưa đặt tên"), code: readNullableString(record, ["code", "ma_nghi_quyet", "so_hieu"]), sectorId: readNullableString(record, ["sector_id", "ma_nganh"]), programs: [] }; }
function normalizeProgram(record: RawRecord): ProgramNode { return { id: readString(record, ["id"], crypto.randomUUID()), resolutionId: readString(record, ["resolution_id", "nghi_quyet_id"], ""), name: readString(record, ["name", "title", "ten_chuong_trinh", "ten"], "Chương trình chưa đặt tên"), sectorId: readNullableString(record, ["sector_id", "ma_nganh"]), targets: [] }; }
function normalizeTarget(record: RawRecord): TargetNode { return { id: readString(record, ["id"], crypto.randomUUID()), programId: readString(record, ["program_id", "chuong_trinh_id"], ""), name: readString(record, ["name", "title", "ten_chi_tieu", "ten"], "Chỉ tiêu chưa đặt tên"), sectorId: readNullableString(record, ["sector_id", "ma_nganh"]), sectorName: readString(record, ["sector_name", "don_vi_phu_trach", "nganh_phu_trach"], "Chưa phân công"), status: normalizeStatus(readString(record, ["status", "trang_thai"], "in_progress")), progress: readNumber(record, ["progress", "tien_do", "phan_tram_hoan_thanh"], 0), ownerName: readString(record, ["owner_name", "nguoi_chiu_trach_nhiem", "assignee_name"], "Chưa phân công"), ownerAvatarUrl: readNullableString(record, ["owner_avatar_url", "avatar_url", "anh_dai_dien"]), deadline: readNullableString(record, ["deadline", "due_date", "thoi_han_hoan_thanh", "han_hoan_thanh"]) }; }
function buildTree(rawResolutions: RawRecord[], rawPrograms: RawRecord[], rawTargets: RawRecord[]) { const resolutions = rawResolutions.map(normalizeResolution); const programs = rawPrograms.map(normalizeProgram); const targets = rawTargets.map(normalizeTarget); const resolutionMap = new Map(resolutions.map((resolution) => [resolution.id, resolution])); const programMap = new Map(programs.map((program) => [program.id, program])); for (const target of targets) programMap.get(target.programId)?.targets.push(target); for (const program of programs) resolutionMap.get(program.resolutionId)?.programs.push(program); return resolutions; }

async function loadResolutionTree() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [profileResponse, resolutionsResponse, programsResponse, targetsResponse] = await Promise.all([
    user ? supabase.from("profiles").select("role, vai_tro, sector_id, ma_nganh").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("nghi_quyet").select("*"),
    supabase.from("chuong_trinh").select("*"),
    supabase.from("chi_tieu").select("*")
  ]);
  if (resolutionsResponse.error) console.error("Cannot load nghi_quyet:", resolutionsResponse.error.message);
  if (programsResponse.error) console.error("Cannot load chuong_trinh:", programsResponse.error.message);
  if (targetsResponse.error) console.error("Cannot load chi_tieu:", targetsResponse.error.message);
  const profile = (profileResponse.data ?? {}) as RawRecord;
  return { currentUserRole: normalizeRole(profile.role ?? profile.vai_tro), currentSectorId: readNullableString(profile, ["sector_id", "ma_nganh"]), tree: buildTree((resolutionsResponse.data ?? []) as RawRecord[], (programsResponse.data ?? []) as RawRecord[], (targetsResponse.data ?? []) as RawRecord[]) };
}

export default async function NghiQuyetPage() {
  const { currentUserRole, currentSectorId, tree } = await loadResolutionTree();
  return <main className="min-h-screen bg-[linear-gradient(180deg,#eef7ff_0%,#f8fbff_46%,#eef3f9_100%)] px-4 pb-32 pt-6 text-slate-950 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-5"><header className="flex flex-col gap-3 rounded-lg border border-slate-200/80 bg-white/82 px-5 py-5 shadow-xl shadow-sky-950/5 backdrop-blur sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Ủy ban Kiểm tra</p><h1 className="mt-1 text-2xl font-semibold text-slate-950 sm:text-3xl">Theo dõi Nghị quyết, Chương trình và Chỉ tiêu</h1></div><div className="rounded-full bg-slate-900/90 px-3 py-1.5 text-sm font-medium text-white shadow-lg shadow-sky-950/15">{currentUserRole === "executive" ? "Điều hành" : "Đơn vị / Ngành"}</div></header><TargetTable initialTree={tree} currentUserRole={currentUserRole} currentSectorId={currentSectorId} targetsTableName="chi_tieu" /></div><MacosDock /><Toaster richColors position="top-right" /></main>;
}
