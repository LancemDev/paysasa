import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./Button";

interface Props {
  /** Region name shown to the user, e.g. "dashboard". */
  region: string;
  children: ReactNode;
  className?: string;
}

/** Keeps one region's crash from blanking the whole app. Never shows the stack trace. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.region}]`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className={this.props.className ?? "m-4 rounded-[var(--radius-card)] border border-border bg-surface p-6"}>
        <h2 className="font-semibold">The {this.props.region} hit a problem</h2>
        <p className="mt-1 text-muted">The rest of PaySasa still works. Your data is safe.</p>
        <Button className="mt-4" size="sm" onClick={() => this.setState({ failed: false })}>
          Reload {this.props.region}
        </Button>
      </div>
    );
  }
}
