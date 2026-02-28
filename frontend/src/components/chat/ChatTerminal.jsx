import { useState, useRef, useEffect } from 'react'
import { useSession } from '../../hooks/useSession'

function renderMarkdown(text) {
  // Minimal markdown: code blocks, inline code, bold, bullet lists
  const lines = text.split('\n')
  const result = []
  let inCodeBlock = false
  let codeBuffer = []
  let codeLang = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        result.push(
          <pre key={`code-${i}`} className="chat-code-block">
            <code>{codeBuffer.join('\n')}</code>
          </pre>
        )
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

export default function ChatTerminal() {
  const { chatHistory, isAiLoading, sendChat, username } = useSession()
  const userInitial = username ? username[0].toUpperCase() : 'Y'
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatHistory, isAiLoading])

  const handleSubmit = (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isAiLoading) return
    setInput('')
    sendChat(text)
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-left">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M2 3h12v8H4l-2 2V3z" />
          </svg>
          <span>AI Assistant</span>
        </div>
        <span className="chat-header-badge">Gemini</span>
      </div>

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
              {msg.role === 'user' ? userInitial : 'AI'}
            </div>
            <div className="chat-msg-body">
              {msg.role === 'assistant' ? renderMarkdown(msg.content) : <p>{msg.content}</p>}
            </div>
          </div>
        ))}
        {isAiLoading && (
          <div className="chat-msg chat-msg--assistant">
            <div className="chat-msg-avatar">AI</div>
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
