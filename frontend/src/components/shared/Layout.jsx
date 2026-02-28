import Header from './Header'
import ProblemStatement from '../editor/ProblemStatement'
import FileTree from '../editor/FileTree'
import CodeEditor from '../editor/CodeEditor'
import ChatTerminal from '../chat/ChatTerminal'

export default function Layout() {
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
    </div>
  )
}
