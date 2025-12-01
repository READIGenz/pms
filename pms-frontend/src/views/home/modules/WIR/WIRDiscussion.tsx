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
  createdAt: string;        // ISO
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

  const threadTitle = useMemo(
    () => `Discussion — ${wirCode || wirId}`,
    [wirCode, wirId]
  );

  // ---- load thread ----
  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      // BE should sort by createdAt asc/desc; we’ll sort client side anyway.
      const { data } = await api.get(
        `/projects/${projectId}/wir/${wirId}/discussion`
      );
      const items: CommentRow[] = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
        ? data
        : [];
      // oldest first for chat flow
      items.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
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
      const { data } = await api.post(
        `/projects/${projectId}/wir/${wirId}/discussion`,
        { text: trimmed }
      );
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
      <div className="text-sm text-gray-700 dark:text-gray-200 font-medium">
        {threadTitle}
      </div>

      <div
        ref={listRef}
        className="rounded-2xl border dark:border-neutral-800 p-3 max-h-[50vh] overflow-auto bg-white dark:bg-neutral-900"
      >
        {loading ? (
          <div className="text-sm">Loading…</div>
        ) : err ? (
          <div className="text-sm text-rose-600">{err}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-gray-300">No messages yet.</div>
        ) : (
          <ul className="space-y-3">
            {rows.map((m) => (
              <li key={m.id} className="rounded-xl border dark:border-neutral-800 p-2">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] text-gray-600 dark:text-gray-300">
                    {m.authorName || "User"}
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400">
                    {new Date(m.createdAt).toLocaleString()}
                    {m.editedAt ? " • edited" : ""}
                  </div>
                </div>
                <div className="mt-1 text-sm whitespace-pre-wrap break-words dark:text-white">
                  {m.text}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border dark:border-neutral-800 p-3">
        <div className="text-[12px] text-gray-500 dark:text-gray-400 mb-1">
          Signed in as: {creatorName}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          className="w-full text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 bg-white dark:bg-neutral-900"
          placeholder="Write a comment… (Enter to send, Shift+Enter for newline)"
          maxLength={2000}
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[12px] text-rose-600">{postErr || "\u00A0"}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading || posting}
              className="text-sm px-3 py-2 rounded-lg border dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-60"
              title="Refresh thread"
            >
              Refresh
            </button>
            <button
              onClick={doPost}
              disabled={posting || !text.trim()}
              className="text-sm px-4 py-2 rounded-lg border dark:border-neutral-800 bg-blue-600 text-white disabled:opacity-60"
              title="Post comment"
            >
              {posting ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
