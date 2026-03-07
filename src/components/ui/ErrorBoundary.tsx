import { Component, type ReactNode } from 'react';

interface Props {
  fallback?: ReactNode;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="p-6 text-center">
          <p className="text-text-secondary mb-2">Something went wrong.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="text-accent hover:underline text-sm"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
