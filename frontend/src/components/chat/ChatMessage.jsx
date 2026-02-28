// ChatMessage — single message renderer
// Zidan's domain. Extracted from ChatTerminal for reuse.
// TODO: implement as a standalone component

export default function ChatMessage({ role, content }) {
  return (
    <div className={`chat-msg chat-msg--${role}`}>
      <div className="chat-msg-avatar">
        {role === 'user' ? 'Y' : 'AI'}
      </div>
      <div className="chat-msg-body">
        <p>{content}</p>
      </div>
    </div>
  )
}
