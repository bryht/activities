import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { resolveLink } from '../lib/api'
import { saveToken } from '../lib/session'
import PlatformButtons from '../components/PlatformButtons'

// Landing page for a short manage link (/m/<code>). It exchanges the code for a
// session token, stores it, and redirects to the activity. Expired / unknown
// codes get a friendly card with a one-tap path back to the bot.
export default function ManageLink() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let alive = true
    resolveLink(code)
      .then((data) => {
        if (!alive) return
        if (!data) {
          setState({ status: 'unknown' })
        } else if (data.expired) {
          setState({ status: 'expired', activityId: data.activityId })
        } else {
          // Sign in for the hour, then drop the user on the activity page.
          saveToken(data.token)
          navigate(`/activities/${data.activityId}`, { replace: true })
        }
      })
      .catch(() => alive && setState({ status: 'error' }))
    return () => {
      alive = false
    }
  }, [code, navigate])

  if (state.status === 'loading') {
    return <div className="p-8 text-center text-slate-400 dark:text-slate-500">Opening your link…</div>
  }

  if (state.status === 'expired') {
    return (
      <Card
        emoji="⏰"
        title="This link has expired"
        body="Manage links last one hour. Tap below and the KidGo bot will send you a fresh one for this activity."
      >
        <PlatformButtons
          full={false}
          label="Get a fresh link 🔑"
          payload={`manage_${state.activityId}`}
        />
      </Card>
    )
  }

  // unknown / error
  return (
    <Card
      emoji="🤷"
      title="This link isn't valid"
      body="It may have been mistyped or already replaced. Ask the KidGo bot for your activities to get working links."
    >
      <PlatformButtons
        full={false}
        label="Open KidGo 💬"
        payload="mine"
      />
      <Link to="/activities" className="mt-3 inline-block text-sm font-semibold text-brand-600 dark:text-brand-400">
        ← Browse activities
      </Link>
    </Card>
  )
}

function Card({ emoji, title, body, children }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12 text-center">
      <p className="text-4xl">{emoji}</p>
      <h1 className="mt-3 text-xl font-extrabold text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{body}</p>
      <div className="mt-5 flex flex-col items-center">{children}</div>
    </div>
  )
}
