import React from "react";

type State = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("B2B ERP 화면 오류", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="fatal-error-panel">
        <section className="panel">
          <p className="eyebrow">화면 보호 모드</p>
          <h1>화면 오류가 감지되었습니다</h1>
          <p>앱 전체가 빈 화면으로 멈추지 않도록 오류 보호 화면을 표시했습니다. 새로고침 후에도 반복되면 콘솔 오류 메시지를 기준으로 수정하면 됩니다.</p>
          <div className="safe-alert">오류: {this.state.message || "알 수 없는 오류"}</div>
          <button type="button" onClick={() => window.location.reload()}>새로고침</button>
        </section>
      </main>
    );
  }
}
