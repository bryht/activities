import { useReference } from '../context/Reference'

export default function GroupBadge({ groupId, showRange = false, size = 'sm' }) {
  const { groupById } = useReference()
  const g = groupById(groupId)
  if (!g) return null
  const pad = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ring-1 ${g.color} ${pad}`}>
      <span>{g.emoji}</span>
      <span>{g.name}</span>
      {showRange && <span className="font-normal opacity-70">· {g.range}</span>}
    </span>
  )
}
