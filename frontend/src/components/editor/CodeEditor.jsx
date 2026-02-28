import MonacoEditor from '@monaco-editor/react'
import { useSession } from '../../hooks/useSession'

export default function Editor() {
  const { activeFile, openFiles, fileBuffers, updateFileContent, openFile, closeFile } = useSession()

  const currentContent = activeFile ? (fileBuffers[activeFile] || '# File not loaded') : ''

  return (
    <div className="editor-panel">
      <div className="editor-tabs">
        {openFiles.map((f) => (
          <div
            key={f}
            className={`editor-tab ${f === activeFile ? 'editor-tab--active' : ''}`}
            onClick={() => openFile(f)}
          >
            <span className="editor-tab-name">{f.split('/').pop()}</span>
            <button
              className="editor-tab-close"
              onClick={(e) => {
                e.stopPropagation()
                closeFile(f)
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <div className="editor-body">
        {activeFile ? (
          <MonacoEditor
            key={activeFile}
            height="100%"
            language="python"
            theme="sponge-dark"
            value={currentContent}
            onChange={(val) => updateFileContent(activeFile, val || '')}
            beforeMount={(monaco) => {
              monaco.editor.defineTheme('sponge-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                  { token: 'comment', foreground: '6b665f', fontStyle: 'italic' },
                  { token: 'keyword', foreground: '52b788' },
                  { token: 'string', foreground: 'e0b555' },
                  { token: 'number', foreground: '74c69d' },
                  { token: 'type', foreground: '5588cc' },
                  { token: 'function', foreground: 'f5f0e8' },
                  { token: 'variable', foreground: 'e0ddd7' },
                  { token: 'operator', foreground: '9a958e' },
                  { token: 'decorator', foreground: '40916c' },
                ],
                colors: {
                  'editor.background': '#111413',
                  'editor.foreground': '#e0ddd7',
                  'editor.lineHighlightBackground': '#1a1e1c',
                  'editor.selectionBackground': '#2d6a4f55',
                  'editor.inactiveSelectionBackground': '#2d6a4f33',
                  'editorLineNumber.foreground': '#3a3f3c',
                  'editorLineNumber.activeForeground': '#6b665f',
                  'editorCursor.foreground': '#52b788',
                  'editorIndentGuide.background': '#1e2321',
                  'editorIndentGuide.activeBackground': '#2a2f2c',
                  'editor.selectionHighlightBackground': '#40916c22',
                  'editorBracketMatch.background': '#40916c33',
                  'editorBracketMatch.border': '#40916c55',
                  'scrollbarSlider.background': '#2a2f2c88',
                  'scrollbarSlider.hoverBackground': '#3a3f3caa',
                },
              })
            }}
            options={{
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontLigatures: true,
              lineHeight: 20,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 12 },
              renderLineHighlight: 'line',
              cursorBlinking: 'smooth',
              smoothScrolling: true,
              tabSize: 4,
              wordWrap: 'off',
              automaticLayout: true,
            }}
          />
        ) : (
          <div className="editor-empty">
            <div className="editor-empty-icon">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="6" y="4" width="28" height="32" rx="3" />
                <path d="M12 12h16M12 18h12M12 24h8" strokeLinecap="round" />
              </svg>
            </div>
            <p>Select a file from the tree to start editing</p>
          </div>
        )}
      </div>
    </div>
  )
}
