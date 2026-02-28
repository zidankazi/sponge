import Header from './Header'
import ProblemStatement from '../editor/ProblemStatement'
import FileTree from '../editor/FileTree'
import CodeEditor from '../editor/CodeEditor'
import ChatTerminal from '../chat/ChatTerminal'
import { useSession } from '../../hooks/useSession'

export default function Layout() {
  const { isSubmitting } = useSession()

  return (
    <div className="layout">
      <Header />
      <div className="layout-body">
        <aside className="layout-sidebar">
          <ProblemStatement />
          <FileTree />
        </aside>
        <main className="layout-main">
          <div className="layout-editor">
            <CodeEditor />
          </div>
          <div className="layout-chat">
            <ChatTerminal />
          </div>
        </main>
      </div>
      {isSubmitting && (
        <div className="submitting-overlay">
          <div className="submitting-spinner"></div>
          Grading your session...
        </div>
      )}
    </div>
  )
}
