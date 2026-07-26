import { useState } from 'react'
import { RealBackendDemo } from './RealBackendDemo'
import { MockDemo } from './MockDemo'

export function App() {
  // On a static deploy (e.g. GitHub Pages) there is no local fake backend to
  // talk to, so default to the tab that works with no network at all.
  const [tab, setTab] = useState<'real' | 'mock'>(import.meta.env.PROD ? 'mock' : 'real')

  return (
    <main>
      <h1>authkit playground</h1>
      <nav className="tabs">
        <button className={tab === 'real' ? 'active' : ''} onClick={() => setTab('real')}>
          Real backend
        </button>
        <button className={tab === 'mock' ? 'active' : ''} onClick={() => setTab('mock')}>
          Mock manager
        </button>
      </nav>
      {tab === 'real' ? <RealBackendDemo /> : <MockDemo />}
    </main>
  )
}
