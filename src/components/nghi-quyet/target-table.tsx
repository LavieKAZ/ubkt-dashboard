"use client";

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, CalendarDays, ChevronDown, ChevronRight, CircleDot, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export type UserRole = "executive" | "sector" | "unit";
export type TargetStatus = "completed" | "in_progress" | "delayed";
type RawRecord = Record<string, unknown>;

export type TargetNode = { id: string; programId: string; name: string; sectorId: string | null; sectorName: string; status: TargetStatus; progress: number; ownerName: string; ownerAvatarUrl: string | null; deadline: string | null };
export type ProgramNode = { id: string; resolutionId: string; name: string; sectorId: string | null; targets: TargetNode[] };
export type ResolutionNode = { id: string; name: string; code: string | null; sectorId: string | null; programs: ProgramNode[] };

type DisplayRow =
  | { kind: "resolution"; id: string; depth: 0; resolution: ResolutionNode }
  | { kind: "program"; id: string; depth: 1; resolution: ResolutionNode; program: ProgramNode }
  | { kind: "target"; id: string; depth: 2; resolution: ResolutionNode; program: ProgramNode; target: TargetNode };

type NewTargetForm = { name: string; sectorName: string; status: TargetStatus; progress: number; ownerName: string; ownerAvatarUrl: string; deadline: string };

const emptyTargetForm: NewTargetForm = { name: "", sectorName: "", status: "in_progress", progress: 0, ownerName: "", ownerAvatarUrl: "", deadline: "" };
const statusPresentation: Record<TargetStatus, { label: string; badgeClassName: string; barClassName: string }> = {
  completed: { label: "Đã đạt", badgeClassName: "bg-emerald-100 text-emerald-700 ring-emerald-200", barClassName: "bg-emerald-500" },
  in_progress: { label: "Đang thực hiện", badgeClassName: "bg-amber-100 text-amber-700 ring-amber-200", barClassName: "bg-amber-500" },
  delayed: { label: "Chậm tiến độ", badgeClassName: "bg-rose-100 text-rose-700 ring-rose-200", barClassName: "bg-rose-500" }
};

function clampProgress(progress: number) { return Number.isNaN(progress) ? 0 : Math.min(100, Math.max(0, progress)); }
function formatDeadline(deadline: string | null) {
  if (!deadline) return "Chưa đặt";
  const date = new Date(deadline);
  return Number.isNaN(date.getTime()) ? deadline : new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}
function getInitials(name: string) { return name.trim().split(/\s+/).filter(Boolean).slice(-2).map((word) => word[0]?.toUpperCase()).join("") || "UB"; }
function readProgramId(rawTarget: RawRecord) { const value = rawTarget.program_id ?? rawTarget.chuong_trinh_id; return value == null ? null : String(value); }
export function normalizeStatus(status: string): TargetStatus {
  const normalized = status.trim().toLowerCase();
  if (["completed", "done", "dat", "da_dat", "đã đạt"].includes(normalized)) return "completed";
  if (["delayed", "late", "slow", "cham", "cham_tien_do", "chậm tiến độ"].includes(normalized)) return "delayed";
  return "in_progress";
}
function normalizeInsertedTarget(rawTarget: RawRecord, program: ProgramNode): TargetNode {
  return {
    id: String(rawTarget.id),
    programId: String(rawTarget.program_id ?? rawTarget.chuong_trinh_id ?? program.id),
    name: String(rawTarget.name ?? rawTarget.ten_chi_tieu ?? rawTarget.title ?? "Chỉ tiêu mới"),
    sectorId: rawTarget.sector_id == null ? program.sectorId : String(rawTarget.sector_id),
    sectorName: String(rawTarget.sector_name ?? rawTarget.don_vi_phu_trach ?? "Chưa phân công"),
    status: normalizeStatus(String(rawTarget.status ?? rawTarget.trang_thai ?? "in_progress")),
    progress: clampProgress(Number(rawTarget.progress ?? rawTarget.tien_do ?? 0)),
    ownerName: String(rawTarget.owner_name ?? rawTarget.nguoi_chiu_trach_nhiem ?? "Chưa phân công"),
    ownerAvatarUrl: rawTarget.owner_avatar_url == null ? null : String(rawTarget.owner_avatar_url),
    deadline: rawTarget.deadline == null ? null : String(rawTarget.deadline)
  };
}
function flattenRows(tree: ResolutionNode[], expandedProgramIds: Set<string>, currentUserRole: UserRole, sectorId: string | null) {
  const rows: DisplayRow[] = [];
  const canSeeSector = (rowSectorId: string | null) => currentUserRole === "executive" || !sectorId || !rowSectorId || rowSectorId === sectorId;
  for (const resolution of tree) {
    if (!canSeeSector(resolution.sectorId)) continue;
    rows.push({ kind: "resolution", id: `resolution-${resolution.id}`, depth: 0, resolution });
    for (const program of resolution.programs) {
      if (!canSeeSector(program.sectorId)) continue;
      rows.push({ kind: "program", id: `program-${program.id}`, depth: 1, resolution, program });
      if (!expandedProgramIds.has(program.id)) continue;
      for (const target of program.targets) if (canSeeSector(target.sectorId)) rows.push({ kind: "target", id: `target-${target.id}`, depth: 2, resolution, program, target });
    }
  }
  return rows;
}

export function TargetTable({ initialTree, currentUserRole, currentSectorId, targetsTableName = "chi_tieu" }: { initialTree: ResolutionNode[]; currentUserRole: UserRole; currentSectorId: string | null; targetsTableName?: string }) {
  const [tree, setTree] = useState(initialTree);
  const [expandedProgramIds, setExpandedProgramIds] = useState<Set<string>>(() => new Set(initialTree.flatMap((resolution) => resolution.programs.slice(0, 1).map((program) => program.id))));
  const [targetToDelete, setTargetToDelete] = useState<TargetNode | null>(null);
  const [deletingTargetIds, setDeletingTargetIds] = useState<Set<string>>(new Set());
  const [addProgramId, setAddProgramId] = useState<string | null>(null);
  const [newTargetForm, setNewTargetForm] = useState<NewTargetForm>(emptyTargetForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const displayedRows = useMemo(() => flattenRows(tree, expandedProgramIds, currentUserRole, currentSectorId), [currentSectorId, currentUserRole, expandedProgramIds, tree]);
  const selectedProgram = useMemo(() => tree.flatMap((resolution) => resolution.programs).find((program) => program.id === addProgramId) ?? null, [addProgramId, tree]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`nghi-quyet-targets-${targetsTableName}`).on("postgres_changes", { event: "*", schema: "public", table: targetsTableName }, (payload) => {
      if (payload.eventType === "DELETE") {
        const deletedId = String((payload.old as RawRecord).id ?? "");
        if (!deletedId) return;
        setDeletingTargetIds((current) => new Set(current).add(deletedId));
        window.setTimeout(() => {
          setTree((currentTree) => currentTree.map((resolution) => ({ ...resolution, programs: resolution.programs.map((program) => ({ ...program, targets: program.targets.filter((target) => target.id !== deletedId) })) })));
          setDeletingTargetIds((current) => { const next = new Set(current); next.delete(deletedId); return next; });
        }, 280);
        return;
      }
      const rawTarget = payload.new as RawRecord;
      const programId = readProgramId(rawTarget);
      if (!programId) return;
      setTree((currentTree) => currentTree.map((resolution) => ({ ...resolution, programs: resolution.programs.map((program) => {
        if (program.id !== programId) return program;
        const normalizedTarget = normalizeInsertedTarget(rawTarget, program);
        const exists = program.targets.some((target) => target.id === normalizedTarget.id);
        return { ...program, targets: exists ? program.targets.map((target) => target.id === normalizedTarget.id ? normalizedTarget : target) : [...program.targets, normalizedTarget] };
      }) })));
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [targetsTableName]);

  function toggleProgram(programId: string) { setExpandedProgramIds((current) => { const next = new Set(current); next.has(programId) ? next.delete(programId) : next.add(programId); return next; }); }
  function canManageSector(sectorId: string | null) { return currentUserRole === "executive" || Boolean(currentSectorId && sectorId === currentSectorId); }
  function openCreateDialog(program: ProgramNode) { setAddProgramId(program.id); setNewTargetForm(emptyTargetForm); }
  async function handleCreateTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProgram || !newTargetForm.name.trim()) return;
    setIsSubmitting(true);
    const supabase = createClient();
    const progress = clampProgress(Number(newTargetForm.progress));
    const englishPayload = { program_id: selectedProgram.id, name: newTargetForm.name.trim(), sector_id: selectedProgram.sectorId ?? currentSectorId, sector_name: newTargetForm.sectorName.trim() || "Chưa phân công", status: newTargetForm.status, progress, owner_name: newTargetForm.ownerName.trim() || "Chưa phân công", owner_avatar_url: newTargetForm.ownerAvatarUrl.trim() || null, deadline: newTargetForm.deadline || null };
    const vietnamesePayload = { chuong_trinh_id: selectedProgram.id, ten_chi_tieu: englishPayload.name, sector_id: englishPayload.sector_id, don_vi_phu_trach: englishPayload.sector_name, trang_thai: englishPayload.status, tien_do: englishPayload.progress, nguoi_chiu_trach_nhiem: englishPayload.owner_name, owner_avatar_url: englishPayload.owner_avatar_url, deadline: englishPayload.deadline };
    const firstAttempt = await supabase.from(targetsTableName).insert(englishPayload).select("*").single();
    const result = firstAttempt.error ? await supabase.from(targetsTableName).insert(vietnamesePayload).select("*").single() : firstAttempt;
    if (result.error || !result.data) { toast.error("Không thể thêm chỉ tiêu", { description: result.error?.message ?? "Vui lòng kiểm tra RLS và cấu trúc bảng." }); setIsSubmitting(false); return; }
    const createdTarget = normalizeInsertedTarget(result.data as RawRecord, selectedProgram);
    setTree((currentTree) => currentTree.map((resolution) => ({ ...resolution, programs: resolution.programs.map((program) => program.id === selectedProgram.id ? { ...program, targets: [...program.targets, createdTarget] } : program) })));
    setExpandedProgramIds((current) => new Set(current).add(selectedProgram.id));
    setNewTargetForm(emptyTargetForm);
    setAddProgramId(null);
    setIsSubmitting(false);
    toast.success("Đã thêm chỉ tiêu mới.");
  }
  async function handleConfirmDelete() {
    if (!targetToDelete) return;
    setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from(targetsTableName).delete().eq("id", targetToDelete.id);
    if (error) { toast.error("Không thể xóa chỉ tiêu", { description: error.message }); setIsDeleting(false); return; }
    const deletedTarget = targetToDelete;
    setTargetToDelete(null);
    setDeletingTargetIds((current) => new Set(current).add(deletedTarget.id));
    window.setTimeout(() => {
      setTree((currentTree) => currentTree.map((resolution) => ({ ...resolution, programs: resolution.programs.map((program) => ({ ...program, targets: program.targets.filter((target) => target.id !== deletedTarget.id) })) })));
      setDeletingTargetIds((current) => { const next = new Set(current); next.delete(deletedTarget.id); return next; });
      setIsDeleting(false);
      toast.success("Đã xóa chỉ tiêu thành công!");
    }, 280);
  }

  const columns: ColumnDef<DisplayRow>[] = [
    { id: "name", header: "Tên chỉ tiêu", cell: ({ row }) => {
      const item = row.original;
      if (item.kind === "resolution") return <div className="flex items-center gap-2 font-semibold text-slate-950"><CircleDot className="h-4 w-4 text-sky-700" /><span>{item.resolution.name}</span>{item.resolution.code ? <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">{item.resolution.code}</span> : null}</div>;
      if (item.kind === "program") { const isExpanded = expandedProgramIds.has(item.program.id); return <button type="button" onClick={() => toggleProgram(item.program.id)} className="flex w-full items-center gap-2 rounded-md py-1 text-left font-medium text-slate-800 transition-colors duration-150 hover:text-sky-800" aria-expanded={isExpanded}>{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<span>{item.program.name}</span><span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{item.program.targets.length} chỉ tiêu</span></button>; }
      return <span className="font-medium text-slate-700">{item.target.name}</span>;
    }},
    { id: "sector", header: "Đơn vị / Ngành", cell: ({ row }) => row.original.kind === "target" ? <span className="text-sm text-slate-600">{row.original.target.sectorName}</span> : <span className="text-slate-400">-</span> },
    { id: "status", header: "Trạng thái", cell: ({ row }) => { if (row.original.kind !== "target") return <span className="text-slate-400">-</span>; const presentation = statusPresentation[row.original.target.status]; return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1", presentation.badgeClassName)}>{presentation.label}</span>; }},
    { id: "progress", header: "Tiến độ", cell: ({ row }) => { if (row.original.kind !== "target") return <span className="text-slate-400">-</span>; const progress = clampProgress(row.original.target.progress); const presentation = statusPresentation[row.original.target.status]; return <div className="min-w-28"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><motion.div className={cn("h-full rounded-full", presentation.barClassName)} initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }} /></div><span className="w-9 text-right text-xs font-medium text-slate-500">{progress}%</span></div></div>; }},
    { id: "owner", header: "Người chịu trách nhiệm", cell: ({ row }) => { if (row.original.kind !== "target") return <span className="text-slate-400">-</span>; const target = row.original.target; return <div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-full bg-sky-100 bg-cover bg-center text-[11px] font-semibold text-sky-800 ring-1 ring-sky-200" style={target.ownerAvatarUrl ? { backgroundImage: `url(${target.ownerAvatarUrl})`, color: "transparent" } : undefined}>{getInitials(target.ownerName)}</div><span className="max-w-36 truncate text-sm text-slate-700">{target.ownerName}</span></div>; }},
    { id: "deadline", header: "Thời hạn", cell: ({ row }) => row.original.kind === "target" ? <span className="inline-flex items-center gap-1.5 text-sm text-slate-600"><CalendarDays className="h-3.5 w-3.5 text-slate-400" />{formatDeadline(row.original.target.deadline)}</span> : <span className="text-slate-400">-</span> },
    { id: "actions", header: "", cell: ({ row }) => { const item = row.original; if (item.kind === "program") return canManageSector(item.program.sectorId) ? <Button type="button" variant="ghost" size="sm" onClick={() => openCreateDialog(item.program)} className="text-sky-700 hover:text-sky-900"><Plus className="h-4 w-4" />Thêm</Button> : null; if (item.kind !== "target" || !canManageSector(item.target.sectorId)) return null; return <Button type="button" variant="ghost" size="icon" aria-label={`Xóa ${item.target.name}`} onClick={() => setTargetToDelete(item.target)} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></Button>; }}
  ];
  const table = useReactTable({ data: displayedRows, columns, getCoreRowModel: getCoreRowModel(), getRowId: (row) => row.id });

  return <>
    <section className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-sky-950/5">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-semibold text-slate-950">Quản lý cây Nghị quyết</h2><p className="text-sm text-slate-500">Nghị quyết -&gt; Chương trình -&gt; Chỉ tiêu</p></div><div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800 ring-1 ring-sky-100"><BarChart3 className="h-4 w-4" />{displayedRows.filter((row) => row.kind === "target").length} chỉ tiêu đang hiển thị</div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[980px] border-separate border-spacing-0 text-left"><thead className="bg-white">{table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id}>{headerGroup.headers.map((header) => <th key={header.id} className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody><AnimatePresence initial={false}>{table.getRowModel().rows.map((row) => { const item = row.original; const isDeleting = item.kind === "target" && deletingTargetIds.has(item.target.id); return <motion.tr key={row.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: isDeleting ? 0 : 1, height: "auto", scale: isDeleting ? 0.985 : 1 }} exit={{ opacity: 0, height: 0, scale: 0.985 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className={cn("group", item.kind === "resolution" && "bg-sky-50/70", item.kind === "target" && "bg-white hover:bg-slate-50/80")}>{row.getVisibleCells().map((cell, cellIndex) => <td key={cell.id} className={cn("border-b border-slate-100 px-4 py-3 align-middle text-sm", cellIndex === 0 && item.depth === 1 && "pl-10", cellIndex === 0 && item.depth === 2 && "pl-16")}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</motion.tr>; })}</AnimatePresence></tbody></table>{displayedRows.length === 0 ? <div className="grid min-h-48 place-items-center px-6 py-10 text-center text-sm text-slate-500">Chưa có dữ liệu phù hợp với quyền truy cập hiện tại.</div> : null}</div>
    </section>

    <Dialog open={Boolean(addProgramId)} onOpenChange={(open) => !open && setAddProgramId(null)}><DialogContent><DialogHeader><DialogTitle>Thêm chỉ tiêu mới</DialogTitle><DialogDescription>Chỉ tiêu sẽ được thêm vào chương trình {selectedProgram ? `"${selectedProgram.name}"` : "đã chọn"}.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={handleCreateTarget}><div className="grid gap-2"><Label htmlFor="target-name">Tên chỉ tiêu</Label><input id="target-name" value={newTargetForm.name} onChange={(event) => setNewTargetForm((current) => ({ ...current, name: event.target.value }))} className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-sky-500" placeholder="Nhập tên chỉ tiêu" required /></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="target-sector">Đơn vị / Ngành phụ trách</Label><input id="target-sector" value={newTargetForm.sectorName} onChange={(event) => setNewTargetForm((current) => ({ ...current, sectorName: event.target.value }))} className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-sky-500" /></div><div className="grid gap-2"><Label htmlFor="target-status">Trạng thái</Label><select id="target-status" value={newTargetForm.status} onChange={(event) => setNewTargetForm((current) => ({ ...current, status: event.target.value as TargetStatus }))} className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-sky-500"><option value="completed">Đã đạt</option><option value="in_progress">Đang thực hiện</option><option value="delayed">Chậm tiến độ</option></select></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="target-progress">Tiến độ (%)</Label><input id="target-progress" type="number" min={0} max={100} value={newTargetForm.progress} onChange={(event) => setNewTargetForm((current) => ({ ...current, progress: Number(event.target.value) }))} className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-sky-500" /></div><div className="grid gap-2"><Label htmlFor="target-deadline">Thời hạn hoàn thành</Label><input id="target-deadline" type="date" value={newTargetForm.deadline} onChange={(event) => setNewTargetForm((current) => ({ ...current, deadline: event.target.value }))} className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-sky-500" /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="target-owner">Người chịu trách nhiệm</Label><input id="target-owner" value={newTargetForm.ownerName} onChange={(event) => setNewTargetForm((current) => ({ ...current, ownerName: event.target.value }))} className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-sky-500" /></div><div className="grid gap-2"><Label htmlFor="target-avatar">URL ảnh đại diện</Label><input id="target-avatar" value={newTargetForm.ownerAvatarUrl} onChange={(event) => setNewTargetForm((current) => ({ ...current, ownerAvatarUrl: event.target.value }))} className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-sky-500" /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setAddProgramId(null)}>Hủy</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Đang thêm..." : "Thêm chỉ tiêu"}</Button></DialogFooter></form></DialogContent></Dialog>

    <AlertDialog open={Boolean(targetToDelete)} onOpenChange={(open) => !open && setTargetToDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Xác nhận xóa chỉ tiêu</AlertDialogTitle><AlertDialogDescription>Hành động này sẽ xóa chỉ tiêu {targetToDelete ? `"${targetToDelete.name}"` : "đã chọn"} khỏi cơ sở dữ liệu. Vui lòng xác nhận trước khi tiếp tục.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel><AlertDialogAction className="bg-rose-600 hover:bg-rose-700" disabled={isDeleting} onClick={(event) => { event.preventDefault(); void handleConfirmDelete(); }}>{isDeleting ? "Đang xóa..." : "Xóa chỉ tiêu"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
