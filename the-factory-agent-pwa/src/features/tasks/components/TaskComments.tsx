'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Loader2, MessageSquare, Send, WifiOff } from 'lucide-react';

import { toast } from '@/lib/toast';
import type { ApiError } from '@/types';
import { useCreateTaskComment, useTaskComments } from '../queries';
import { TASK_COMMENT_MAX_LENGTH, canLoadTaskComments, validateTaskComment, type TaskComment } from '../comments';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  supervisor: 'Supervisor',
  agent: 'Agent',
};

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function useIsOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CommentBubble({ comment }: { comment: TaskComment }) {
  const role = comment.author?.role ? ROLE_LABELS[comment.author.role] ?? comment.author.role : null;
  return (
    <li
      className={`rounded-2xl border-[0.5px] px-4 py-3 font-sans ${
        comment.isMine ? 'bg-[#75ADAF]/15 border-[#75ADAF]/30 ml-6' : 'bg-[#0B3343]/70 border-white/8 mr-6'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-xs font-semibold text-white">
          {comment.isMine ? 'You' : comment.author?.name ?? 'Former user'}
        </span>
        {role && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#75ADAF]">{role}</span>
        )}
        <time dateTime={comment.createdAt ?? undefined} className="ml-auto text-[10px] text-[#8F9098]">
          {formatTimestamp(comment.createdAt)}
        </time>
      </div>
      <p className="mt-1 text-sm text-[#D0D0D0] leading-relaxed whitespace-pre-wrap break-words">
        {comment.body}
      </p>
    </li>
  );
}

export function TaskComments({ taskId }: { taskId: string }) {
  const [draft, setDraft] = useState('');
  const [fieldError, setFieldError] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const isOnline = useIsOnline();

  const commentsQuery = useTaskComments(taskId);
  const createMutation = useCreateTaskComment(taskId);

  const items = commentsQuery.data?.items ?? [];
  const canComment = commentsQuery.data?.canComment ?? false;
  const errorStatus = (commentsQuery.error as ApiError | null)?.status;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [items.length]);

  if (!canLoadTaskComments(taskId) || errorStatus === 403) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (createMutation.isPending) return;
    if (!isOnline) {
      toast.error('You are offline. Connect to the internet to post a comment.');
      return;
    }

    const error = validateTaskComment(draft);
    if (error) {
      setFieldError(error);
      return;
    }

    createMutation.mutate(draft.trim(), {
      onSuccess: () => {
        setDraft('');
        setFieldError('');
      },
      onError: (err) => {
        const apiError = err as unknown as ApiError;
        const bodyError = apiError?.errors?.body?.[0];
        if (bodyError) {
          setFieldError(bodyError);
          return;
        }
        toast.error(apiError?.message || 'Unable to post your comment. Please try again.');
      },
    });
  };

  return (
    <section className="mt-2 mb-6 font-sans" aria-labelledby="task-comments-heading">
      <h4
        id="task-comments-heading"
        className="flex items-center gap-1.5 text-xs font-bold text-[#75ADAF] mb-3 uppercase tracking-wider"
      >
        <MessageSquare size={13} />
        Comments &amp; Feedback
        {items.length > 0 && <span className="text-[#8F9098] font-semibold">({items.length})</span>}
      </h4>

      {commentsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-[#8F9098] py-3" role="status">
          <Loader2 size={14} className="animate-spin" /> Loading comments…
        </div>
      ) : commentsQuery.isError ? (
        <div className="rounded-2xl border border-[#FD6046]/30 bg-[#FD6046]/10 px-4 py-3 text-xs text-[#FD6046]">
          {isOnline ? "Couldn't load comments." : 'Comments are unavailable offline.'}{' '}
          <button type="button" onClick={() => commentsQuery.refetch()} className="font-semibold underline">
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-[#8F9098] py-2">
          No comments yet.{canComment ? ' Share an update with whoever assigned this task.' : ''}
        </p>
      ) : (
        <ul ref={listRef} className="flex flex-col gap-2.5 max-h-[50vh] overflow-y-auto">
          {items.map((comment) => (
            <CommentBubble key={comment.id} comment={comment} />
          ))}
        </ul>
      )}

      {canComment && !commentsQuery.isError && (
        <form onSubmit={handleSubmit} className="mt-3" noValidate>
          {!isOnline && (
            <p className="flex items-center gap-1.5 text-[11px] text-[#F5A623] mb-2">
              <WifiOff size={12} /> You&apos;re offline. Comments can be posted once you reconnect.
            </p>
          )}
          <label htmlFor="task-comment-input" className="sr-only">
            Add a comment
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="task-comment-input"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (fieldError) setFieldError('');
              }}
              rows={2}
              maxLength={TASK_COMMENT_MAX_LENGTH}
              placeholder="Write feedback…"
              disabled={createMutation.isPending}
              aria-invalid={!!fieldError}
              aria-describedby={fieldError ? 'task-comment-error' : undefined}
              className={`flex-1 bg-white/5 border rounded-2xl px-4 py-2.5 text-sm text-white outline-none resize-none placeholder:text-white/30 transition-colors disabled:opacity-60 ${
                fieldError ? 'border-[#FD6046]/60' : 'border-white/10 focus:border-[#75ADAF]/60'
              }`}
            />
            <button
              type="submit"
              aria-label="Post comment"
              disabled={createMutation.isPending || !draft.trim() || !isOnline}
              className="h-11 w-11 shrink-0 rounded-full bg-[#75ADAF] text-white flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
            >
              {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          {fieldError && (
            <p id="task-comment-error" className="text-[11px] text-[#FD6046] mt-1">
              {fieldError}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
