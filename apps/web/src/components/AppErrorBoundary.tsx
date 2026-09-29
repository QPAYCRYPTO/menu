// apps/web/src/components/AppErrorBoundary.tsx
//
// React Error Boundary — component tree içindeki crash'leri yakalar.
//
// Kullanım: App'in en dışında wrap'le. Bir component crash olursa:
//   1. Hata errorReporter ile backend'e gönderilir
//   2. Kullanıcıya anlamlı bir hata sayfası gösterilir (beyaz ekran yerine)
//   3. "Sayfayı yenile" butonu ile recovery seçeneği sunulur

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { reportError } from '../lib/errorReporter';
import { TriangleAlert } from 'lucide-react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  errorMessage: string | null;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    errorMessage: null
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message ?? 'Bilinmeyen hata'
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Backend'e log at — CRITICAL severity (component crash = kullanıcı uygulamayı kullanamıyor)
    reportError({
      severity: 'HIGH',
      message: error.message ?? 'React component crash',
      stack: error.stack ?? null,
      context: {
        type: 'react-error-boundary',
        component_stack: errorInfo.componentStack ?? null
      }
    });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'var(--bg)',
          color: 'var(--ink)'
        }}
      >
        <div
          className="ui-card rounded-3xl fade-enter"
          style={{
            maxWidth: '480px',
            width: '100%',
            padding: '40px 32px',
            textAlign: 'center'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '16px',
              color: 'var(--state-warn)'
            }}
          >
            <TriangleAlert size={48} />
          </div>

          <h1
            className="font-serif"
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: 'var(--ink)',
              marginBottom: '12px'
            }}
          >
            Beklenmeyen bir hata oluştu
          </h1>

          <p
            style={{
              fontSize: '14px',
              color: 'var(--ink-muted)',
              marginBottom: '24px',
              lineHeight: 1.5
            }}
          >
            Sorunu otomatik olarak ekibimize bildirdik. Sayfayı yenileyerek
            tekrar denemek isteyebilirsiniz.
          </p>

          {this.state.errorMessage && (
            <div
              style={{
                background: 'var(--state-danger-bg)',
                border: '1px solid var(--state-danger)',
                borderRadius: '14px',
                padding: '12px',
                marginBottom: '20px',
                fontSize: '12px',
                color: 'var(--state-danger)',
                fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace',
                wordBreak: 'break-word',
                textAlign: 'left'
              }}
            >
              {this.state.errorMessage.slice(0, 200)}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}
          >
            <button
              onClick={this.handleReload}
              className="btn-primary spring-btn"
              style={{
                padding: '10px 20px',
                borderRadius: '999px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Sayfayı yenile
            </button>
            <button
              onClick={this.handleGoHome}
              className="ui-chip spring-btn"
              style={{
                padding: '10px 20px',
                borderRadius: '999px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Ana sayfaya dön
            </button>
          </div>
        </div>
      </div>
    );
  }
}