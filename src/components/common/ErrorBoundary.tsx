import { Component, type ReactNode } from "react";

/** Contains render errors to one panel so the rest of the workspace stays usable. */
export class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    if (this.state.failed)
      return (
        <div role="alert" className="card-surface p-4 text-sm">
          {this.props.label} could not be displayed.{" "}
          <button className="underline" onClick={() => this.setState({ failed: false })}>Retry</button>
        </div>
      );
    return this.props.children;
  }
}
