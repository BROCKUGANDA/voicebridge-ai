'use client'

import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[VoiceBridge] ErrorBoundary caught:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div
          className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center"
          role="alert"
        >
          <AlertTriangle className="w-10 h-10 text-[#FFB627] mb-4" />
          <h2 className="text-sm font-medium text-white/80 mb-2">Something went wrong</h2>
          <p className="text-xs text-[#8B98A8] mb-4 max-w-sm">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-[#00F0FF]/30 text-[#00F0FF]"
            onClick={this.handleReset}
          >
            <RefreshCw className="w-3 h-3 mr-1.5" />
            Try Again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
