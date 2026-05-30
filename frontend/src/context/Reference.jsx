import { createContext, useContext } from 'react'
import { useApi } from '../lib/api'

// Groups (developmental stages) and spots are reference data served by the API
// — fetched once and shared, replacing the prototype's hard-coded data/*.js.
const ReferenceContext = createContext({
  groups: [],
  spots: [],
  areas: [],
  groupById: () => null,
  spotById: () => null,
  ready: false,
})

export function ReferenceProvider({ children }) {
  const { data: groups } = useApi('/api/groups')
  const { data: spots } = useApi('/api/spots')

  const value = {
    groups: groups || [],
    spots: spots || [],
    areas: [...new Set((spots || []).map((s) => s.area))],
    groupById: (id) => (groups || []).find((g) => g.id === id) || null,
    spotById: (id) => (spots || []).find((s) => s.id === id) || null,
    ready: !!groups && !!spots,
  }

  return <ReferenceContext.Provider value={value}>{children}</ReferenceContext.Provider>
}

export const useReference = () => useContext(ReferenceContext)
