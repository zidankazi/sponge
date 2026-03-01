import { useState, useCallback, useEffect, useRef } from 'react'

/**
 * Generic drag-to-resize hook.
 *
 * @param {'horizontal'|'vertical'} direction
 * @param {number} initialSize   starting px size
 * @param {number} minSize       minimum px
 * @param {number} maxSize       maximum px
 * @returns {{ size: number, handleProps: object }}
 */
export default function useResizable({ direction, initialSize, minSize, maxSize }) {
  const [size, setSize] = useState(initialSize)
  const dragging = useRef(false)
  const startPos = useRef(0)
  const startSize = useRef(0)

  const onMouseDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY
    startSize.current = size

    const cursorClass = direction === 'horizontal' ? 'is-resizing-col' : 'is-resizing-row'
    document.body.classList.add('is-resizing', cursorClass)
  }, [direction, size])

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return

      // Horizontal (sidebar): dragging right = bigger
      // Vertical (chat): dragging up = bigger
      const raw = direction === 'horizontal'
        ? startSize.current + (e.clientX - startPos.current)
        : startSize.current - (e.clientY - startPos.current)

      setSize(Math.min(maxSize, Math.max(minSize, raw)))
    }

    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.classList.remove('is-resizing', 'is-resizing-col', 'is-resizing-row')
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [direction, minSize, maxSize])

  return {
    size,
    handleProps: { onMouseDown },
  }
}
