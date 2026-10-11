import { Component, type ReactNode } from 'react'
import { Notice } from './Notice'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Notice
        tone="error"
        role="alert"
        title="The explorer stopped working"
        actions={
          <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        }
      >
        <p>{this.state.error.message}</p>
      </Notice>
    )
  }
}
