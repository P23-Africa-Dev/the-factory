'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateTaskComment, useTaskComments } from '@/hooks/use-tasks';
import { ApiRequestError } from '@/lib/api/onboarding';
import { TASK_COMMENT_MAX_LENGTH, type TaskCommentItem } from '@/lib/api/tasks';
import { DEFAULT_AVATAR } from '@/lib/avatar';

type TaskCommentsProps = {
  taskId: number | string;
  companyId?: number | string;
  className?: string;
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  supervisor: 'Supervisor',
  agent: 'Agent',
};

export function formatCommentTimestamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CommentRow({ comment }: { comment: TaskCommentItem }) {
  const roleLabel = comment.author?.role ? ROLE_LABELS[comment.author.role] ?? comment.author.role : null;

  return (
    <li className="flex gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={comment.author?.avatar_url || DEFAULT_AVATAR}
        alt=""
        className="w-8 h-8 rounded-full object-cover shrink-0 bg-gray-100"
      />
      <div
        className={`min-w-0 flex-1 rounded-[14px] px-4 py-3 ${
          comment.is_mine ? 'bg-[#7EB5AE]/10' : 'bg-dash-bg'
        }`}
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-semibold text-dash-dark">
            {comment.author?.name ?? 'Former user'}
            {comment.is_mine && <span className="text-gray-400 font-normal"> (you)</span>}
          </span>
          {roleLabel && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#094B5C] bg-white rounded-full px-2 py-0.5">
              {roleLabel}
            </span>
          )}
          <time dateTime={comment.created_at ?? undefined} className="text-[11px] text-gray-400 ml-auto">
            {formatCommentTimestamp(comment.created_at)}
          </time>
        </div>
        <p className="mt-1 text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap break-words">
          {comment.body}
        </p>
      </div>
    </li>
  );
}

export function TaskComments({ taskId, companyId, className = '' }: TaskCommentsProps) {
  const [draft, setDraft] = useState('');
  const [fieldError, setFieldError] = useState('');
  const listRef = useRef<HTMLUListElement>(null);

  const commentsQuery = useTaskComments(taskId, companyId);
  const createMutation = useCreateTaskComment(taskId, companyId, {
    onSuccess: () => {
      setDraft('');
      setFieldError('');
    },
  });

  const items = commentsQuery.data?.items ?? [];
  const canComment = commentsQuery.data?.can_comment ?? false;
  const isForbidden =
    commentsQuery.error instanceof ApiRequestError && commentsQuery.error.status === 403;

  useEffect(() => {
    // Keep the newest comment in view inside the list without scrolling the surrounding page.
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [items.length]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (createMutation.isPending) return;

    const body = draft.trim();
    if (!body) {
      setFieldError('Comment cannot be empty.');
      return;
    }
    if (body.length > TASK_COMMENT_MAX_LENGTH) {
      setFieldError(`Comment may not be longer than ${TASK_COMMENT_MAX_LENGTH} characters.`);
      return;
    }

    createMutation.mutate(body, {
      onError: (error) => {
        const apiError = error instanceof ApiRequestError ? error : null;
        const bodyError = apiError?.errors?.body?.[0];
        if (bodyError) {
          setFieldError(bodyError);
          return;
        }
        toast.error(error.message || 'Unable to post your comment. Please try again.');
      },
    });
  };

  // Users without access to the thread simply don't see the section.
  if (isForbidden) return null;

  return (
    <section className={className} aria-labelledby={`task-comments-${taskId}`}>
      <h3 id={`task-comments-${taskId}`} className="text-[15px] font-bold text-dash-dark mb-3 flex items-center gap-2">
        <MessageSquare size={16} className="text-gray-400" />
        Comments &amp; Feedback
        {items.length > 0 && <span className="text-[12px] font-medium text-gray-400">({items.length})</span>}
      </h3>

      {commentsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-[13px] text-gray-400 py-4" role="status">
          <Loader2 size={14} className="animate-spin" /> Loading comments…
        </div>
      ) : commentsQuery.isError ? (
        <div className="rounded-[14px] border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-500">
          Couldn&apos;t load comments.{' '}
          <button type="button" onClick={() => commentsQuery.refetch()} className="font-semibold underline">
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-gray-400 py-2">
          No comments yet.{canComment ? ' Start the conversation below.' : ''}
        </p>
      ) : (
        <ul ref={listRef} className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {items.map((comment) => (
            <CommentRow key={comment.id} comment={comment} />
          ))}
        </ul>
      )}

      {canComment && !commentsQuery.isError && (
        <form onSubmit={handleSubmit} className="mt-3" noValidate>
          <label htmlFor={`task-comment-input-${taskId}`} className="sr-only">
            Add a comment
          </label>
          <div className="relative">
            <textarea
              id={`task-comment-input-${taskId}`}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (fieldError) setFieldError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e);
              }}
              placeholder="Write feedback or a reply…"
              maxLength={TASK_COMMENT_MAX_LENGTH}
              rows={3}
              disabled={createMutation.isPending}
              aria-invalid={!!fieldError}
              aria-describedby={fieldError ? `task-comment-error-${taskId}` : undefined}
              className={`w-full bg-dash-bg rounded-[18px] px-5 py-4 pr-14 text-[13px] text-dash-dark outline-none border resize-none placeholder:text-gray-300 disabled:opacity-60 ${
                fieldError ? 'border-red-300' : 'border-transparent focus:border-gray-200'
              }`}
            />
            <button
              type="submit"
              disabled={createMutation.isPending || !draft.trim()}
              aria-label="Post comment"
              className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-[#7EB5AE] text-white flex items-center justify-center hover:opacity-90 transition-all disabled:opacity-40"
            >
              {createMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
          {fieldError && (
            <p id={`task-comment-error-${taskId}`} className="text-red-400 text-[11px] mt-1">
              {fieldError}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
