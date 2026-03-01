import { useState } from 'react'
import Header from './Header'
import SaveHistory from './SaveHistory'
import ProblemStatement from '../editor/ProblemStatement'
import FileTree from '../editor/FileTree'
import CodeEditor from '../editor/CodeEditor'
import ChatTerminal from '../chat/ChatTerminal'
import { useSession } from '../../hooks/useSession'
import useResizable from '../../hooks/useResizable'

function CollapsedProblemBar({ onExpand }) {
  return (
    <button className="collapsed-panel-bar" onClick={onExpand}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span>Problem</span>
      <svg className="collapsed-panel-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none">
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

function CollapsedChatBar({ onExpand }) {
  return (
    <button className="collapsed-panel-bar collapsed-panel-bar--chat" onClick={onExpand}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M2 3h12v8H4l-2 2V3z" />
      </svg>
      <span>AI Assistant</span>
      <svg className="collapsed-panel-chevron collapsed-panel-chevron--up" width="12" height="12" viewBox="0 0 16 16" fill="none">
        <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

export default function Layout() {
  const { isSubmitting, showHistory, setShowHistory } = useSession()

  const [problemCollapsed, setProblemCollapsed] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)

  const sidebar = useResizable({
    direction: 'horizontal',
    initialSize: 280,
    minSize: 180,
    maxSize: 500,
  })

  const chat = useResizable({
    direction: 'vertical',
    initialSize: 280,
    minSize: 120,
    maxSize: 600,
  })

  return (
    <div className="layout">
      <Header />
      <div className="layout-body">
        <aside className="layout-sidebar" style={{ width: sidebar.size, minWidth: sidebar.size }}>
          {problemCollapsed ? (
            <CollapsedProblemBar onExpand={() => setProblemCollapsed(false)} />
          ) : (
            <ProblemStatement onCollapse={() => setProblemCollapsed(true)} />
          )}
          <FileTree />
        </aside>

        <div
          className="resize-handle resize-handle--horizontal"
          {...sidebar.handleProps}
        />

        <main className="layout-main">
          <div className="layout-editor">
            <CodeEditor />
          </div>

          {chatCollapsed ? (
            <CollapsedChatBar onExpand={() => setChatCollapsed(false)} />
          ) : (
            <>
              <div
                className="resize-handle resize-handle--vertical"
                {...chat.handleProps}
              />
              <div className="layout-chat" style={{ height: chat.size }}>
                <ChatTerminal onCollapse={() => setChatCollapsed(true)} />
              </div>
            </>
          )}
        </main>
      </div>
      {isSubmitting && (
        <div className="submitting-overlay">
          <div className="submitting-spinner"></div>
          Grading your session...
        </div>
      )}
      <SaveHistory open={showHistory} onClose={() => setShowHistory(false)} />
    </div>
  )
}
