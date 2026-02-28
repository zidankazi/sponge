// Shared Button component
// Both Zidan and Designer can use and modify this.

export default function Button({ children, variant = 'primary', onClick, disabled, className = '' }) {
  const base = 'btn'
  const variantClass = `btn--${variant}`

  return (
    <button
      className={`${base} ${variantClass} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
