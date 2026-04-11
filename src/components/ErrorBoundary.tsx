"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <h2 style={styles.title}>Something went wrong</h2>
            <p style={styles.message}>
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button onClick={this.handleRetry} style={styles.button}>
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={styles.secondaryButton}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "200px",
    padding: "2rem",
  },
  card: {
    maxWidth: "400px",
    padding: "1.5rem",
    borderRadius: "8px",
    backgroundColor: "#fff",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    textAlign: "center",
  },
  title: {
    margin: "0 0 0.5rem",
    fontSize: "1.25rem",
    color: "#333",
  },
  message: {
    margin: "0 0 1rem",
    color: "#666",
    fontSize: "0.875rem",
  },
  button: {
    padding: "0.5rem 1rem",
    marginRight: "0.5rem",
    fontSize: "0.875rem",
    color: "#fff",
    backgroundColor: "#0070f3",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    color: "#666",
    backgroundColor: "transparent",
    border: "1px solid #ccc",
    borderRadius: "4px",
    cursor: "pointer",
  },
};

export default ErrorBoundary;