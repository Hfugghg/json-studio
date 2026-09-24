import { Component } from 'react';

// React 错误边界组件。
// 捕获子组件树中的渲染错误，显示降级 UI 并提供重试机制。
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] 捕获渲染错误:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-icon">⚠</div>
          <h2 className="error-boundary-title">页面出现错误</h2>
          <p className="error-boundary-message">
            {this.state.error?.message || '发生了未知错误'}
          </p>
          <button
            className="error-boundary-retry"
            onClick={this.handleRetry}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
