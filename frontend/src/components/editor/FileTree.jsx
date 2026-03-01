import { useState } from 'react'
import { useSession } from '../../hooks/useSession'
import fileTree from '../../data/fileTree'
import fileContents from '../../data/fileContents'

function PythonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 1C5 1 3.5 1.9 3.5 3.5V5H7v.5H3C1.6 5.5.5 6.6.5 8S1.6 10.5 3 10.5H4.5V9C4.5 7.6 5.5 7 7 7h3C11.4 7 13 5.9 13 4.5V3.5C13 1.9 11.5 1 9.5 1H7z" fill="#3776AB"/>
      <path d="M7 13c2 0 3.5-.9 3.5-2.5V9H7v-.5h4C12.4 8.5 13.5 7.4 13.5 6S12.4 3.5 11 3.5H9.5V5C9.5 6.4 8.5 7 7 7H4C2.6 7 1 8.1 1 9.5v1C1 12.1 2.5 13 4.5 13H7z" fill="#FFD43B"/>
      <circle cx="5.5" cy="3.2" r=".9" fill="#FFD43B"/>
      <circle cx="8.5" cy="10.8" r=".9" fill="#3776AB"/>
    </svg>
  )
}

function MarkdownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <rect x=".5" y=".5" width="13" height="13" rx="2" fill="#3d6db5"/>
      <path d="M2 10V4h1.5l1.5 2 1.5-2H8v6H6.5V6.5L5 8.5 3.5 6.5V10H2z" fill="white"/>
      <path d="M9 10V7.5H7.5l2-3.5 2 3.5H10V10H9z" fill="white"/>
    </svg>
  )
}

function TextIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <rect x=".5" y=".5" width="13" height="13" rx="2" fill="none" stroke="#6b665f" strokeWidth="1"/>
      <path d="M3 4.5h8M3 7h8M3 9.5h5" stroke="#6b665f" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function YamlIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <rect x=".5" y=".5" width="13" height="13" rx="2" fill="#cc7832" opacity=".85"/>
      <path d="M3 4.5L5 7v2.5H5V7L7 4.5" stroke="none"/>
      <path d="M2.5 4h1.2l1.3 2 1.3-2H7.5L5.6 7.2V10H4.4V7.2L2.5 4z" fill="white"/>
      <path d="M8 4h1.2v2.3L11.5 4H13l-2.8 3V10h-1.2V7L8 4z" fill="white"/>
    </svg>
  )
}

function ConfigIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <rect x=".5" y=".5" width="13" height="13" rx="2" fill="none" stroke="#6b665f" strokeWidth="1"/>
      <circle cx="7" cy="7" r="2" fill="none" stroke="#9a958e" strokeWidth="1.2"/>
      <path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2" stroke="#9a958e" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M3.2 3.2l1.4 1.4M9.4 9.4l1.4 1.4M3.2 10.8l1.4-1.4M9.4 4.6l1.4-1.4" stroke="#9a958e" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

function HtmlIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <rect x=".5" y=".5" width="13" height="13" rx="2" fill="#e44d26"/>
      <path d="M4 5L2.5 7 4 9M10 5L11.5 7 10 9M7.5 4.5l-1 5" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

function CssIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <rect x=".5" y=".5" width="13" height="13" rx="2" fill="#264de4"/>
      <path d="M4 5L2.5 7 4 9M10 5L11.5 7 10 9" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="7" cy="7" r="1.3" fill="white"/>
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <rect x=".5" y=".5" width="13" height="13" rx="2" fill="none" stroke="#52b788" strokeWidth="1"/>
      <circle cx="5" cy="5" r="1.2" fill="#52b788"/>
      <path d="M1.5 10l3-4 2.5 3 1.5-2 3 3" stroke="#52b788" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

function DefaultFileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <rect x=".5" y=".5" width="13" height="13" rx="2" fill="none" stroke="#3a3a3a" strokeWidth="1"/>
      <path d="M3 4.5h8M3 7h6M3 9.5h4" stroke="#3a3a3a" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

const FILE_ICON_MAP = {
  py:   <PythonIcon />,
  md:   <MarkdownIcon />,
  txt:  <TextIcon />,
  yml:  <YamlIcon />,
  yaml: <YamlIcon />,
  cfg:  <ConfigIcon />,
  ini:  <ConfigIcon />,
  html: <HtmlIcon />,
  css:  <CssIcon />,
  png:  <ImageIcon />,
  psd:  <ImageIcon />,
}

function getIcon(name) {
  const ext = name.split('.').pop()
  return FILE_ICON_MAP[ext] || <DefaultFileIcon />
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
      <span className="tree-file-icon">{getIcon(node.name)}</span>
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
