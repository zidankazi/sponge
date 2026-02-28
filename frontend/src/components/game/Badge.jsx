// Badge — badge icon + label for each tier
// Designer's domain.
// Tiers: "AI Collaborator" (85-100), "On Your Way" (70-84), "Needs Work" (50-69), "Just Vibing" (0-49)

const TIER_CONFIG = {
  'AI Collaborator': { colorClass: 'badge--green', dot: '◆' },
  'On Your Way': { colorClass: 'badge--blue', dot: '◆' },
  'Needs Work': { colorClass: 'badge--yellow', dot: '◆' },
  'Just Vibing': { colorClass: 'badge--red', dot: '◆' },
}

export default function Badge({ badge }) {
  const config = TIER_CONFIG[badge] || { colorClass: 'badge--default', dot: '◆' }

  return (
    <span className={`badge ${config.colorClass}`}>
      <span className="badge-dot">{config.dot}</span>
      {badge}
    </span>
  )
}
