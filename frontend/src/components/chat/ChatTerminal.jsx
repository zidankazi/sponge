import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from '../../hooks/useSession'

/**
 * Try to extract a target filename from a code fence.
 * Patterns checked:
 *   1. ```python rq/queue.py   (language + filename on fence line)
 *   2. First line: # rq/queue.py  or  # --- rq/queue.py ---
 */
function extractFilename(codeLang, codeLines, fileBufferKeys) {
  // Pattern 1: fence line has a filename after the language  e.g. "python rq/queue.py"
  const fenceParts = codeLang.split(/\s+/)
  if (fenceParts.length >= 2) {
    const candidate = fenceParts.slice(1).join(' ').trim()
    if (fileBufferKeys.includes(candidate)) return candidate
  }

  // Pattern 2: first line is a comment with a filename
  if (codeLines.length > 0) {
    const first = codeLines[0].trim()
    // Match: # rq/queue.py  or  # --- rq/queue.py ---
    const commentMatch = first.match(/^#\s*(?:---\s*)?(.+?)(?:\s*---)?$/)
    if (commentMatch) {
      const candidate = commentMatch[1].trim()
      if (fileBufferKeys.includes(candidate)) return candidate
    }
  }

  return null
}

/**
 * Smart-merge a code snippet into an existing file.
 *
 * Strategy:
 *   1. Use first N lines of the snippet as a "start anchor" — find where they
 *      appear consecutively in the existing file.
 *   2. Use last N lines as an "end anchor" — find where they appear.
 *   3. Replace everything between those anchors with the snippet.
 *   4. If anchors can't be found, fall back to full file replace.
 */
function smartMerge(existingContent, snippetContent) {
  const existingLines = existingContent.split('\n')
  const snippetLines = snippetContent.split('\n')

  if (snippetLines.length === 0) return existingContent

  // Helper: check if `needle` lines match consecutively starting at `haystack[offset]`
  const matchAt = (haystack, offset, needle) => {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[offset + j]?.trim() !== needle[j].trim()) return false
    }
    return true
  }

  // Try anchor sizes 3 → 2 → 1
  const maxAnchor = Math.min(3, snippetLines.length)
  let startIdx = -1
  let anchorUsed = 0

  for (let a = maxAnchor; a >= 1; a--) {
    const anchor = snippetLines.slice(0, a)
    // Skip if anchor is all blank lines
    if (anchor.every((l) => l.trim() === '')) continue
    for (let i = 0; i <= existingLines.length - a; i++) {
      if (matchAt(existingLines, i, anchor)) {
        startIdx = i
        anchorUsed = a
        break
      }
    }
    if (startIdx !== -1) break
  }

  if (startIdx === -1) return snippetContent // total fallback

  // Find end anchor
  const endAnchorSize = Math.min(maxAnchor, snippetLines.length)
  let endIdx = -1

  for (let a = endAnchorSize; a >= 1; a--) {
    const endAnchor = snippetLines.slice(-a)
    if (endAnchor.every((l) => l.trim() === '')) continue
    // Search from startIdx onward
    for (let i = startIdx; i <= existingLines.length - a; i++) {
      if (matchAt(existingLines, i, endAnchor)) {
        endIdx = i + a - 1
        // Don't break — take the LAST match (the actual end, not a duplicate earlier)
      }
    }
    if (endIdx !== -1) break
  }

  if (endIdx === -1 || endIdx < startIdx) {
    // Can't find end — replace from startIdx for snippet length
    endIdx = Math.min(startIdx + snippetLines.length - 1, existingLines.length - 1)
  }

  return [
    ...existingLines.slice(0, startIdx),
    ...snippetLines,
    ...existingLines.slice(endIdx + 1),
  ].join('\n')
}

function ApplyCodeBlock({ filename, code, onApply, reactKey }) {
  const [applied, setApplied] = useState(false)

  const handleApply = () => {
    onApply(filename, code)
    setApplied(true)
  }

  return (
    <div key={reactKey} className="chat-code-apply-wrapper">
      <div className="chat-code-apply-bar">
        <span className="chat-code-apply-filename">{filename}</span>
        <button
          className={`chat-code-apply-btn ${applied ? 'chat-code-apply-btn--applied' : ''}`}
          onClick={handleApply}
          disabled={applied}
        >
          {applied ? 'Applied ✓' : 'Apply'}
        </button>
      </div>
      <pre className="chat-code-block chat-code-block--with-bar">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function renderMarkdown(text, { fileBuffers, onApplyCode } = {}) {
  const fileBufferKeys = fileBuffers ? Object.keys(fileBuffers) : []
  const lines = text.split('\n')
  const result = []
  let inCodeBlock = false
  let codeBuffer = []
  let codeLang = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const codeContent = codeBuffer.join('\n')
        const targetFile = extractFilename(codeLang, codeBuffer, fileBufferKeys)

        if (targetFile && onApplyCode) {
          result.push(
            <ApplyCodeBlock
              key={`code-${i}`}
              reactKey={`code-${i}`}
              filename={targetFile}
              code={codeContent}
              onApply={onApplyCode}
            />
          )
        } else {
          result.push(
            <pre key={`code-${i}`} className="chat-code-block">
              <code>{codeContent}</code>
            </pre>
          )
        }
        codeBuffer = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
        codeLang = line.slice(3).trim()
      }
      continue
    }

    if (inCodeBlock) {
      codeBuffer.push(line)
      continue
    }

    if (line.trim() === '') {
      result.push(<div key={`br-${i}`} className="chat-line-break" />)
      continue
    }

    // Headers
    if (line.startsWith('**') && line.endsWith('**')) {
      result.push(
        <p key={`h-${i}`} className="chat-heading">
          {line.replace(/\*\*/g, '')}
        </p>
      )
      continue
    }

    // Bullet points
    if (line.match(/^[*\-] /)) {
      result.push(
        <p key={`li-${i}`} className="chat-bullet">
          {renderInline(line.replace(/^[*\-] /, ''))}
        </p>
      )
      continue
    }

    // Numbered items
    if (line.match(/^\d+\. /)) {
      result.push(
        <p key={`ol-${i}`} className="chat-bullet chat-bullet--numbered">
          {renderInline(line)}
        </p>
      )
      continue
    }

    result.push(
      <p key={`p-${i}`} className="chat-paragraph">
        {renderInline(line)}
      </p>
    )
  }

  if (inCodeBlock && codeBuffer.length) {
    result.push(
      <pre key="code-end" className="chat-code-block">
        <code>{codeBuffer.join('\n')}</code>
      </pre>
    )
  }

  return result
}

function renderInline(text) {
  const parts = []
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let last = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index))
    }
    const tok = match[0]
    if (tok.startsWith('`')) {
      parts.push(<code key={match.index} className="chat-inline-code">{tok.slice(1, -1)}</code>)
    } else if (tok.startsWith('**')) {
      parts.push(<strong key={match.index}>{tok.slice(2, -2)}</strong>)
    }
    last = regex.lastIndex
  }

  if (last < text.length) {
    parts.push(text.slice(last))
  }

  return parts
}

export default function ChatTerminal({ onCollapse, hideHeader }) {
  const { chatHistory, isAiLoading, sendChat, username, fileBuffers, updateFileContent, openFile } = useSession()
  const userInitial = username ? username[0].toUpperCase() : 'Y'
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatHistory, isAiLoading])

  const onApplyCode = useCallback((filename, code) => {
    const existing = fileBuffers?.[filename]
    if (existing) {
      updateFileContent(filename, smartMerge(existing, code))
    } else {
      updateFileContent(filename, code)
    }
    openFile(filename)
  }, [updateFileContent, openFile, fileBuffers])

  const handleSubmit = (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isAiLoading) return
    setInput('')
    sendChat(text)
  }

  return (
    <div className="chat-panel">
      {!hideHeader && (
        <div className="chat-header">
          <div className="chat-header-left">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M2 3h12v8H4l-2 2V3z" />
            </svg>
            <span>AI Assistant</span>
          </div>
          <div className="chat-header-right">
            <span className="chat-header-badge">Model: Gemini 3 Flash</span>
            {onCollapse && (
              <button className="panel-collapse-btn" onClick={onCollapse} title="Collapse AI panel">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="chat-messages" ref={scrollRef}>
        {chatHistory.length === 0 && (
          <div className="chat-empty">
            <p>Ask the AI for help with the implementation.</p>
            <p className="chat-empty-hint">
              Try: "How should I approach adding delayed job execution?"
            </p>
          </div>
        )}
        {chatHistory.map((msg, i) => (
          <div key={i} className={`chat-msg chat-msg--${msg.role}`}>
            <div className="chat-msg-avatar">
              {msg.role === 'user' ? (
                <img src="/logos/sponge-pixel.svg" alt="User" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : msg.role === 'error' ? (
                '!'
              ) : (
                <img src="/logos/gemini.png" alt="AI" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              )}
            </div>
            <div className="chat-msg-body">
              {msg.role === 'assistant'
                ? renderMarkdown(msg.content, { fileBuffers, onApplyCode })
                : <p>{msg.content}</p>}
            </div>
          </div>
        ))}
        {isAiLoading && (
          <div className="chat-msg chat-msg--assistant">
            <div className="chat-msg-avatar">
              <img src="/logos/gemini.png" alt="AI" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div className="chat-msg-body">
              <div className="chat-typing">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
      </div>

      <form className="chat-input-bar" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          placeholder="Ask the AI for help..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              handleSubmit(e)
            }
          }}
          disabled={isAiLoading}
        />
        <button
          type="submit"
          className="chat-send"
          disabled={!input.trim() || isAiLoading}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.5 1.5L14.5 8L1.5 14.5V9.5L10.5 8L1.5 6.5V1.5Z" />
          </svg>
        </button>
      </form>
    </div>
  )
}
