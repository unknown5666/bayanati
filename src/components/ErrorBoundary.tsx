'use client';

// Catches render/runtime errors in its subtree and shows the message on screen
// instead of unmounting to a blank page. Without this, one malformed record or
// unexpected value blanks the whole dashboard with nothing to diagnose from.

import { Component, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

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
      <main className="flex min-h-[calc(100dvh-var(--header-h))] items-center justify-center px-4">
        <div className="card max-w-md p-7 text-center animate-scale-in">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
            <Icon name="alert" className="h-6 w-6" />
          </span>
          <p className="mt-4 text-lg font-semibold">Something went wrong</p>
          <p className="mt-2 text-sm leading-relaxed text-paper/[0.72]">
            The page hit an unexpected error while rendering. Details below:
          </p>
          <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-ink-800 bg-ink-950/80 p-3 text-left text-xs leading-relaxed text-paper/[0.72]">
            {error.message}
          </pre>
          <button
            className="btn-ghost mt-5 w-full"
            onClick={() => this.setState({ error: null })}
          >
            <Icon name="refresh" className="h-4 w-4" />
            Try again
          </button>
        </div>
      </main>
    );
  }
}
