// Badge — badge icon + label for each tier
// Designer's domain.
// Tiers: "AI Collaborator" (85-100), "On Your Way" (70-84), "Needs Work" (50-69), "Just Vibing" (0-49)
// Icons: arc/chevron/line/wave per tier personality.

const TIER_ICONS = {
  'AI Collaborator': (
    <svg className="badge-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 8L6 4L10 8" />
    </svg>
  ),
  'On Your Way': (
    <svg className="badge-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 6 C2 6 4 4 6 6 C8 8 10 6 10 6" />
    </svg>
  ),
  'Needs Work': (
    <svg className="badge-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 6 L10 6" />
    </svg>
  ),
  'Just Vibing': (
    <svg className="badge-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 7 C3 5 5 9 6 7 C7 5 9 9 10 7" />
    </svg>
  ),
}

const TIER_CONFIG = {
  'AI Collaborator': { colorClass: 'badge--green' },
  'On Your Way': { colorClass: 'badge--blue' },
  'Needs Work': { colorClass: 'badge--yellow' },
  'Just Vibing': { colorClass: 'badge--red' },
}

export default function Badge({ badge }) {
  const config = TIER_CONFIG[badge] || { colorClass: 'badge--default' }
  const icon = TIER_ICONS[badge] ?? TIER_ICONS['Just Vibing']

  return (
    <span className={`badge ${config.colorClass}`}>
      <span className="badge-icon-wrap">{icon}</span>
      {badge}
    </span>
  )
}
