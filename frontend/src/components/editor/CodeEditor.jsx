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
                  { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
                  { token: 'keyword', foreground: 'c678dd' },
                  { token: 'keyword.control', foreground: 'c678dd' },
                  { token: 'string', foreground: '98c379' },
                  { token: 'string.escape', foreground: '56b6c2' },
                  { token: 'number', foreground: 'd19a66' },
                  { token: 'type', foreground: 'e5c07b' },
                  { token: 'type.identifier', foreground: 'e5c07b' },
                  { token: 'function', foreground: '61afef' },
                  { token: 'variable', foreground: 'e0ddd7' },
                  { token: 'variable.predefined', foreground: 'e06c75' },
                  { token: 'operator', foreground: '56b6c2' },
                  { token: 'decorator', foreground: 'e5c07b' },
                  { token: 'tag', foreground: 'e06c75' },
                  { token: 'attribute.name', foreground: 'd19a66' },
                  { token: 'attribute.value', foreground: '98c379' },
                  { token: 'delimiter', foreground: '9a958e' },
                  { token: 'constant', foreground: 'd19a66' },
                ],
                colors: {
                  'editor.background': '#0a0a0a',
                  'editor.foreground': '#e0ddd7',
                  'editor.lineHighlightBackground': '#151515',
                  'editor.selectionBackground': '#3a3a5c55',
                  'editor.inactiveSelectionBackground': '#3a3a5c33',
                  'editorLineNumber.foreground': '#3a3a3a',
                  'editorLineNumber.activeForeground': '#6b665f',
                  'editorCursor.foreground': '#ffffffcc',
                  'editorIndentGuide.background': '#1e1e1e',
                  'editorIndentGuide.activeBackground': '#2a2a2a',
                  'editor.selectionHighlightBackground': '#61afef22',
                  'editorBracketMatch.background': '#61afef33',
                  'editorBracketMatch.border': '#61afef55',
                  'scrollbarSlider.background': '#2a2a2a88',
                  'scrollbarSlider.hoverBackground': '#3a3a3aaa',
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
