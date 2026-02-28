import { useSession } from '../../hooks/useSession'

function relativeTime(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff < 10) return 'just now'
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
    return `${Math.floor(diff / 3600)}h ago`
}

export default function SaveHistory({ open, onClose }) {
    const { checkpoints, restoreCheckpoint, fileBuffers } = useSession()

    const isCurrentDirty = checkpoints.length === 0 ||
        JSON.stringify(fileBuffers) !== JSON.stringify(checkpoints[0].buffers)

    const handleRestore = (id) => {
        restoreCheckpoint(id)
        onClose()
    }

    return (
        <>
            {open && <div className="history-overlay" onClick={onClose} />}
            <div className={`history-drawer ${open ? 'history-drawer--open' : ''}`}>
                <div className="history-drawer-header">
                    <h3>Checkpoints</h3>
                    <button className="history-close-btn" onClick={onClose}>×</button>
                </div>
                <div className="history-drawer-body">
                    {isCurrentDirty && (
                        <div className="history-entry history-entry--current">
                            <div>
                                <div className="history-entry-time">Current (unsaved)</div>
                                <div className="history-entry-label">Working state</div>
                            </div>
                        </div>
                    )}
                    {checkpoints.length === 0 && (
                        <div className="history-empty">
                            No checkpoints yet.<br />
                            Press <strong>Save</strong> or <strong>⌘S</strong> to capture the current state.
                        </div>
                    )}
                    {checkpoints.map((cp, i) => (
                        <div
                            key={cp.id}
                            className={`history-entry ${i === 0 ? 'history-entry--latest' : ''}`}
                        >
                            <div>
                                <div className="history-entry-time">{relativeTime(cp.ts)}</div>
                                <div className="history-entry-label">{cp.label}</div>
                            </div>
                            <button className="history-restore-btn" onClick={() => handleRestore(cp.id)}>
                                Restore
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </>
    )
}
