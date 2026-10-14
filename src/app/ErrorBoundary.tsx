import { TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";

interface Props {
  readonly children: ReactNode;
  /** The boundary clears itself when this changes (the route), so one broken page does not break the pages after it. */
  readonly resetKey?: string;
}

/** Catches render errors below it and shows a recoverable page instead of a blank screen. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("render failed", error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <EmptyState
        icon={TriangleAlert}
        title="页面出错了"
        description={error.message}
        actions={
          <>
            <Button onClick={() => this.setState({ error: null })}>重试</Button>
            <Button variant="primary" onClick={() => window.location.reload()}>
              刷新页面
            </Button>
          </>
        }
      />
    );
  }
}
