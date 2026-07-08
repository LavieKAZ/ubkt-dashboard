"use client";

import Image from "next/image";
import Link from "next/link";
import { BarChart3, FolderKanban, Home, Radio, Workflow } from "lucide-react";
import { motion, useSpring } from "framer-motion";
import { type ComponentType, type MouseEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type DockItem = { label: string; href: string; icon: ComponentType<{ className?: string }>; isHome?: boolean };

const dockItems: DockItem[] = [
  { label: "Quản lý dự án", href: "/du-an", icon: FolderKanban },
  { label: "Luồng công việc", href: "/luong-cong-viec", icon: Workflow },
  { label: "Trang chủ", href: "/", icon: Home, isHome: true },
  { label: "Bảng điều khiển kết quả", href: "/ket-qua", icon: BarChart3 },
  { label: "Theo dõi dư luận", href: "/du-luan", icon: Radio }
];

const logoCandidates = ["/assets/ubkt-logo.png", "/ubkt-logo.png", "/logo-ubkt.png", "/logo.png", "/images/ubkt-logo.png"];

function calculateScale(distance: number) {
  const normalized = Math.max(0, 1 - Math.abs(distance) / 132);
  return 1 + normalized * 0.52;
}

function DockButton({ item, index, mouseX, setFallbackLogo }: { item: DockItem; index: number; mouseX: number | null; setFallbackLogo: (value: boolean) => void }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [logoIndex, setLogoIndex] = useState(0);
  const scale = useSpring(1, { stiffness: 360, damping: 32, mass: 0.34 });
  const Icon = item.icon;

  useEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || mouseX === null) {
      scale.set(1);
      return;
    }
    scale.set(calculateScale(mouseX - (rect.left + rect.width / 2)));
  }, [mouseX, scale]);

  return (
    <motion.div style={{ scale }} className="relative flex origin-bottom items-end justify-center">
      <Link
        ref={ref}
        href={item.href}
        aria-label={item.label}
        title={item.label}
        className={cn(
          "group relative grid h-12 w-12 place-items-center rounded-2xl border border-white/55 bg-slate-900/85 text-white shadow-lg shadow-sky-950/20 backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-sky-950/90 hover:shadow-xl hover:shadow-sky-900/30",
          item.isHome && "h-14 w-14 bg-white text-slate-900 hover:bg-white"
        )}
        style={{ transitionDelay: `${index * 8}ms` }}
      >
        {item.isHome ? (
          <>
            <Image
              src={logoCandidates[logoIndex]}
              alt="Biểu trưng Ủy ban Kiểm tra"
              width={44}
              height={44}
              className="h-11 w-11 rounded-xl object-contain"
              onError={() => {
                if (logoCandidates[logoIndex + 1]) setLogoIndex((current) => current + 1);
                else setFallbackLogo(true);
              }}
            />
            <Icon className="pointer-events-none absolute h-5 w-5 opacity-0" />
          </>
        ) : (
          <Icon className="h-5 w-5" />
        )}
        <span className="pointer-events-none absolute -top-10 max-w-44 whitespace-nowrap rounded-md bg-slate-950/90 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
          {item.label}
        </span>
      </Link>
    </motion.div>
  );
}

export function MacosDock() {
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [fallbackLogo, setFallbackLogo] = useState(false);

  function handlePointerMove(event: MouseEvent<HTMLDivElement>) {
    setMouseX(event.clientX);
  }

  return (
    <nav aria-label="Điều hướng Nghị quyết" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:bottom-6">
      <div onMouseMove={handlePointerMove} onMouseLeave={() => setMouseX(null)} className="pointer-events-auto flex items-end gap-2 rounded-[26px] border border-white/45 bg-slate-900/72 px-3 py-2 shadow-2xl shadow-sky-950/20 backdrop-blur-2xl">
        {dockItems.map((item, index) =>
          fallbackLogo && item.isHome ? (
            <motion.div key={item.label} className="grid h-14 w-14 place-items-center rounded-2xl border border-white/65 bg-white text-sm font-bold text-sky-950 shadow-lg" whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 360, damping: 32, mass: 0.34 }}>
              UBKT
            </motion.div>
          ) : (
            <DockButton key={item.label} item={item} index={index} mouseX={mouseX} setFallbackLogo={setFallbackLogo} />
          )
        )}
      </div>
    </nav>
  );
}
