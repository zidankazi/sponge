import { useState } from 'react'
import { useSession } from '../../hooks/useSession'
import fileTree from '../../data/fileTree'
import fileContents from '../../data/fileContents'

const FILE_ICONS = {
  py: '🐍',
  md: '#',
  txt: '📄',
  yml: '⚙',
  cfg: '⚙',
  html: '<>',
  css: '{}',
  ini: '⚙',
  psd: '🎨',
  png: '🖼',
}

function getIcon(name, type) {
  if (type === 'folder') return null
  const ext = name.split('.').pop()
  return FILE_ICONS[ext] || '·'
}

function TreeNode({ node, depth = 0 }) {
  const { openFile, activeFile } = useSession()
  const [expanded, setExpanded] = useState(
    node.type === 'folder' && (node.name === 'rq' || depth === 0)
  )

  const hasContent = node.path && fileContents[node.path]
  const isActive = node.path === activeFile

  if (node.type === 'folder') {
    return (
      <div className="tree-folder">
        <div
          className={`tree-row tree-row--folder ${expanded ? 'tree-row--expanded' : ''}`}
          style={{ paddingLeft: depth * 16 + 8 }}
          onClick={() => setExpanded(!expanded)}
        >
          <span className={`tree-chevron ${expanded ? 'tree-chevron--open' : ''}`}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M3 2L7 5L3 8z" />
            </svg>
          </span>
          <span className="tree-folder-icon">
            {expanded ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M1.5 3.5C1.5 2.95 1.95 2.5 2.5 2.5H6L7.5 4H13.5C14.05 4 14.5 4.45 14.5 5V12.5C14.5 13.05 14.05 13.5 13.5 13.5H2.5C1.95 13.5 1.5 13.05 1.5 12.5V3.5Z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M1.5 3.5C1.5 2.95 1.95 2.5 2.5 2.5H6L7.5 4H13.5C14.05 4 14.5 4.45 14.5 5V12.5C14.5 13.05 14.05 13.5 13.5 13.5H2.5C1.95 13.5 1.5 13.05 1.5 12.5V3.5Z" />
              </svg>
            )}
          </span>
          <span className="tree-name">{node.name}</span>
        </div>
        {expanded && node.children && (
          <div className="tree-children">
            {node.children.map((child) => (
              <TreeNode key={child.name} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={`tree-row tree-row--file ${isActive ? 'tree-row--active' : ''} ${hasContent ? 'tree-row--clickable' : 'tree-row--disabled'}`}
      style={{ paddingLeft: depth * 16 + 8 }}
      onClick={() => hasContent && openFile(node.path)}
    >
      <span className="tree-file-icon">{getIcon(node.name, node.type)}</span>
      <span className="tree-name">{node.name}</span>
    </div>
  )
}

export default function FileTree() {
  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M1.5 3.5C1.5 2.95 1.95 2.5 2.5 2.5H6L7.5 4H13.5C14.05 4 14.5 4.45 14.5 5V12.5C14.5 13.05 14.05 13.5 13.5 13.5H2.5C1.95 13.5 1.5 13.05 1.5 12.5V3.5Z" />
        </svg>
        <span>Explorer</span>
      </div>
      <div className="file-tree-list">
        {fileTree.map((node) => (
          <TreeNode key={node.name} node={node} />
        ))}
      </div>
    </div>
  )
}
