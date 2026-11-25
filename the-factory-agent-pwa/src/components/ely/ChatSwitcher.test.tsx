import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChatSwitcher, chatTitle, relativeTime } from './ChatSwitcher';

const NOW = new Date('2026-11-24T12:00:00Z').getTime();

describe('chatTitle', () => {
  it('uses the title, then the last message, then "ELY chat"', () => {
    expect(chatTitle({ thread_id: '1', title: ' Pipeline review ' })).toBe('Pipeline review');
    expect(chatTitle({ thread_id: '1', title: '', last_message_preview: 'Plan my day' })).toBe('Plan my day');
    expect(chatTitle({ thread_id: '1' })).toBe('ELY chat');
  });
});

describe('relativeTime', () => {
  it('formats recent times', () => {
    expect(relativeTime('2026-11-24T11:59:40Z', NOW)).toBe('Just now');
    expect(relativeTime('2026-11-24T11:55:00Z', NOW)).toBe('5m ago');
    expect(relativeTime('2026-11-24T09:00:00Z', NOW)).toBe('3h ago');
    expect(relativeTime('2026-11-23T10:00:00Z', NOW)).toBe('Yesterday');
    expect(relativeTime('2026-11-20T12:00:00Z', NOW)).toBe('4d ago');
  });

  it('returns nothing for a missing or bad date', () => {
    expect(relativeTime(undefined, NOW)).toBe('');
    expect(relativeTime('not a date', NOW)).toBe('');
  });
});

describe('ChatSwitcher', () => {
  const threads = [
    { thread_id: 'a', title: 'Weekly pipeline', updated_at: new Date(Date.now() - 2 * 60_000).toISOString() },
    { thread_id: 'b', title: '', last_message_preview: 'Plan my day', updated_at: '' },
  ];

  it('starts a new chat', () => {
    const onNewChat = vi.fn();
    render(<ChatSwitcher threads={threads} activeThreadId="a" onNewChat={onNewChat} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(onNewChat).toHaveBeenCalledOnce();
  });

  it('disables New chat when the open chat is already empty', () => {
    render(
      <ChatSwitcher threads={[]} activeThreadId={null} canStartNew={false} onNewChat={vi.fn()} onSelect={vi.fn()} />,
    );
    expect((screen.getByRole('button', { name: 'New chat' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('expands the chat list, ticks the current chat and selects another', () => {
    const onSelect = vi.fn();
    render(<ChatSwitcher threads={threads} activeThreadId="a" onNewChat={vi.fn()} onSelect={onSelect} />);

    expect(screen.queryByText('Weekly pipeline')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Chats' }));

    const current = screen.getByText('Weekly pipeline').closest('button');
    expect(current?.getAttribute('aria-current')).toBe('true');
    expect(screen.getByLabelText('Current chat')).toBeTruthy();
    expect(screen.getByText('2m ago')).toBeTruthy();

    fireEvent.click(screen.getByText('Plan my day'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('says when there are no chats yet', () => {
    render(<ChatSwitcher threads={[]} activeThreadId={null} onNewChat={vi.fn()} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chats' }));
    expect(screen.getByText('No chats yet.')).toBeTruthy();
  });
});
