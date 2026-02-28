// Badge — badge icon + label for each tier
// Designer's domain.
// Tiers: "AI Collaborator" (85-100), "On Your Way" (70-84), "Needs Work" (50-69), "Just Vibing" (0-49)

export default function Badge({ badge }) {
  return (
    <span className="badge">
      {badge}
    </span>
  )
}
