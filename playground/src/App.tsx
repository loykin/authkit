import { useState } from 'react'
import { RealBackendDemo } from './RealBackendDemo'
import { MockDemo } from './MockDemo'

export function App() {
  const [tab, setTab] = useState<'real' | 'mock'>('real')

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
