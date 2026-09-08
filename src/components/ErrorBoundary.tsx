'use client';

// Catches render/runtime errors in its subtree and shows the message on screen
// instead of unmounting to a blank page. Without this, one malformed record or
// unexpected value blanks the whole dashboard with nothing to diagnose from.

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Keep it in the console too for anyone with dev tools open.
    console.error('[ErrorBoundary]', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-md p-6 text-center">
          <p className="text-lg font-semibold text-red-400">Something went wrong</p>
          <p className="mt-2 text-sm text-paper/70">
            The page hit an unexpected error while rendering. Details below:
          </p>
          <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-ink-900 p-3 text-left text-xs text-paper/80">
            {error.message}
          </pre>
          <button
            className="btn-ghost mt-4"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }
}
