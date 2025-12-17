// pms-frontend/src/views/home/modules/WIR/WIRDiscussion.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../../../api/client";

type Props = {
  wirId: string;
  wirCode: string | null;
  creatorName: string; // display name to show in composer header
};

type CommentRow = {
  id: string;
  wirId: string;
  text: string;
  authorUserId?: string | null;
  authorName?: string | null;
  createdAt: string; // ISO
  // optional:
  editedAt?: string | null;
};

export default function WIRDiscussion({ wirId, wirCode, creatorName }: Props) {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId!;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<CommentRow[]>([]);
  const [posting, setPosting] = useState(false);
  const [text, setText] = useState("");
  const [postErr, setPostErr] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  const threadTitle = useMemo(() => `Discussion — ${wirCode || wirId}`, [wirCode, wirId]);

  // ---- load thread ----
  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      // BE should sort by createdAt asc/desc; we’ll sort client side anyway.
      const { data } = await api.get(`/projects/${projectId}/wir/${wirId}/discussion`);
      const items: CommentRow[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      // oldest first for chat flow
      items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setRows(items);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Failed to load discussion.");
      setRows([]);
    } finally {
      setLoading(false);
      // scroll to bottom after initial load
      setTimeout(() => listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight }), 0);
    }
  }, [projectId, wirId]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- post a new comment ----
  const doPost = useCallback(async () => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) {
      setPostErr("Type something to post.");
      return;
    }
    setPostErr(null);

    const optimistic: CommentRow = {
      id: `tmp_${Date.now()}`,
      wirId,
      text: trimmed,
      authorName: creatorName,
      createdAt: new Date().toISOString(),
    };

    setPosting(true);
    setRows((prev) => [...prev, optimistic]);
    setText("");

    try {
      const { data } = await api.post(`/projects/${projectId}/wir/${wirId}/discussion`, { text: trimmed });
      // Replace optimistic with server row (id, timestamps, etc.)
      const saved: CommentRow =
        (data?.item ?? data) && typeof (data?.item ?? data) === "object"
          ? (data.item ?? data)
          : { ...optimistic, id: `tmpfail_${Date.now()}` };

      setRows((prev) => {
        const next = prev.slice();
        const idx = next.findIndex((r) => r.id === optimistic.id);
        if (idx >= 0) next[idx] = saved;
        else next.push(saved);
        return next;
      });

      // keep view pinned to bottom
      setTimeout(() => listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight }), 0);
    } catch (e: any) {
      // rollback optimistic on failure
      setRows((prev) => prev.filter((r) => r.id !== optimistic.id));
      setText(trimmed); // put text back so user can retry
      setPostErr(e?.response?.data?.error || e?.message || "Failed to post comment.");
    } finally {
      setPosting(false);
    }
  }, [text, wirId, projectId, creatorName]);

  // Enter → send, Shift+Enter → newline
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!posting) void doPost();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm sm:text-base text-gray-900 dark:text-white font-semibold">{threadTitle}</div>

      {/* Thread */}
      <div
        ref={listRef}
        className="rounded-2xl bg-yellow-50/60 border border-yellow-200/80 dark:bg-emerald-900/20 dark:border-emerald-800/40 p-3 sm:p-4 max-h-[50vh] overflow-auto shadow-sm"
      >
        {loading ? (
          <div className="text-sm text-gray-700 dark:text-gray-200">Loading…</div>
        ) : err ? (
          <div className="text-sm text-rose-600">{err}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-gray-300">No messages yet.</div>
        ) : (
          <ul className="space-y-3">
            {rows.map((m) => (
              <li
                key={m.id}
                className="rounded-2xl bg-white/80 dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 p-3 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[12px] font-medium text-slate-700 dark:text-neutral-200">
                    {m.authorName || "User"}
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400">
                    {new Date(m.createdAt).toLocaleString()}
                    {m.editedAt ? " • edited" : ""}
                  </div>
                </div>
                <div className="mt-1 text-sm whitespace-pre-wrap break-words text-gray-900 dark:text-white">
                  {m.text}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-800/40 bg-white dark:bg-neutral-900 p-3 sm:p-4 shadow-sm">
        <div className="text-[12px] text-gray-600 dark:text-gray-300 mb-2">
          Signed in as: <span className="font-medium">{creatorName}</span>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none resize-none
                     focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-300
                     dark:bg-neutral-900 dark:border-neutral-700 dark:text-white"
          placeholder="Write a comment… (Enter to send, Shift+Enter for newline)"
          maxLength={2000}
        />

        <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="text-[12px] text-rose-600">{postErr || "\u00A0"}</div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              onClick={load}
              disabled={loading || posting}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 shadow-sm
                         hover:bg-slate-50 hover:border-slate-300 disabled:opacity-60
                         dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
              title="Refresh thread"
              type="button"
            >
              Refresh
            </button>
            <button
              onClick={doPost}
              disabled={posting || !text.trim()}
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm
                         hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
              title="Post comment"
              type="button"
            >
              {posting ? "Posting…" : "Post"}
            </button>
          </div>
        </div>

        <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
          Tip: Press <span className="font-semibold">Enter</span> to send, <span className="font-semibold">Shift+Enter</span>{" "}
          for a new line.
        </div>
      </div>
    </div>
  );
}
