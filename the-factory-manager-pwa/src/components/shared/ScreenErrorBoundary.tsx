'use client';

import React from 'react';

type Props = {
  children: React.ReactNode;
  screenName?: string;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`ErrorBoundary caught an error in ${this.props.screenName ?? 'unknown'}:`, error, info);
    // Sentry capture can go here when configured for Next.js
  }

  retry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
          <h2 className="text-xl font-bold text-gray-950 dark:text-gray-50 mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-md">{this.state.error?.message}</p>
          <button
            onClick={this.retry}
            className="px-6 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
