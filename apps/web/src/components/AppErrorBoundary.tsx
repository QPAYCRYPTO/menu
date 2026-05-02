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
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            width: '100%',
            background: 'white',
            borderRadius: '16px',
            padding: '40px 32px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}
        >
          <div
            style={{
              fontSize: '48px',
              marginBottom: '16px'
            }}
          >
            ⚠️
          </div>

          <h1
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: '#0F172A',
              marginBottom: '12px'
            }}
          >
            Beklenmeyen bir hata oluştu
          </h1>

          <p
            style={{
              fontSize: '14px',
              color: '#64748B',
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
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '20px',
                fontSize: '12px',
                color: '#991B1B',
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
              style={{
                padding: '10px 20px',
                background: '#0D9488',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Sayfayı yenile
            </button>
            <button
              onClick={this.handleGoHome}
              style={{
                padding: '10px 20px',
                background: 'white',
                color: '#0F172A',
                border: '1.5px solid #E2E8F0',
                borderRadius: '8px',
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