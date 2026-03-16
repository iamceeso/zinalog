"use client";

import { useState, useEffect, useCallback, useTransition, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LogTable from "@/components/log-table";
import { Download } from "lucide-react";
import type { Log } from "@/lib/db";

interface LogsResponse {
  logs: Log[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

function LogsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [data, setData] = useState<LogsResponse | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const isFirstLoad = useRef(true);

  const filters = {
    level: searchParams.get("level") ?? "all",
    service: searchParams.get("service") ?? "all",
    search: searchParams.get("search") ?? "",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
  };
  const page = parseInt(searchParams.get("page") ?? "1", 10);

  const fetchLogs = useCallback(async () => {
    // Only show loading spinner on the very first fetch; background polls are silent
    if (isFirstLoad.current) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.level !== "all") params.set("level", filters.level);
      if (filters.service !== "all") params.set("service", filters.service);
      if (filters.search) params.set("search", filters.search);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      params.set("page", String(page));
      params.set("limit", "50");

      const res = await fetch(`/api/logs?${params}`);
      const json = await res.json();
      setData(json);
    } finally {
      if (isFirstLoad.current) {
        setLoading(false);
        isFirstLoad.current = false;
      }
    }
  }, [filters.level, filters.service, filters.search, filters.from, filters.to, page]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  useEffect(() => {
    fetch("/api/services")
      .then((r) => r.json())
      .then((d) => setServices(d.services ?? []));
  }, []);

  const updateParam = useCallback(
    (key: string, value: string) => {
      startTransition(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (value === "all" || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
        params.delete("page");
        router.push(`/dashboard/logs?${params}`, { scroll: false });
      });
    },
    [router, searchParams]
  );

  const updateDateRange = useCallback(
    (from: string, to: string) => {
      startTransition(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (from) params.set("from", from); else params.delete("from");
        if (to) params.set("to", to); else params.delete("to");
        params.delete("page");
        router.push(`/dashboard/logs?${params}`, { scroll: false });
      });
    },
    [router, searchParams]
  );

  const clearFilters = useCallback(() => {
    startTransition(() => {
      router.push("/dashboard/logs", { scroll: false });
    });
  }, [router]);

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`/dashboard/logs?${params}`, { scroll: false });
  };

  const exportUrl = (format: "json" | "csv") => {
    const params = new URLSearchParams();
    if (filters.level !== "all") params.set("level", filters.level);
    if (filters.service !== "all") params.set("service", filters.service);
    if (filters.search) params.set("search", filters.search);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    params.set("format", format);
    return `/api/export?${params}`;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-[22px] font-bold mb-1">Logs</h1>
          <p className="text-[13px] text-(--text-muted)">
            Browse and search all collected logs
          </p>
        </div>

        <div className="flex gap-2">
          <a
            href={exportUrl("csv")}
            download
            className="flex items-center gap-1.5 bg-(--bg-card) border border-(--border) rounded-md px-3 py-1.75 text-[12px] text-(--text-muted) no-underline"
          >
            <Download size={13} />
            CSV
          </a>
          <a
            href={exportUrl("json")}
            download
            className="flex items-center gap-1.5 bg-(--bg-card) border border-(--border) rounded-md px-3 py-1.75 text-[12px] text-(--text-muted) no-underline"
          >
            <Download size={13} />
            JSON
          </a>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <LogTable
          logs={data?.logs ?? []}
          total={data?.pagination?.total ?? 0}
          page={page}
          limit={50}
          onPageChange={handlePageChange}
          onFilterChange={updateParam}
          onDateRangeChange={updateDateRange}
          onClearFilters={clearFilters}
          filters={filters}
          services={services}
          loading={loading}
        />
      </div>
    </div>
  );
}

export default function LogsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-75 text-(--text-dim) text-[14px]">
          Loading logs…
        </div>
      }
    >
      <LogsContent />
    </Suspense>
  );
}
