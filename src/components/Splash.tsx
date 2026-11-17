import { useEffect, useState } from 'react'

const SHOW_MS = 3000
const FADE_MS = 400

/** Full-screen opening screen. Shows for 3 seconds on launch, fades out, then unmounts. */
export default function Splash() {
  const [phase, setPhase] = useState<'show' | 'fade' | 'done'>('show')

  useEffect(() => {
    const fade = setTimeout(() => setPhase('fade'), SHOW_MS)
    const done = setTimeout(() => setPhase('done'), SHOW_MS + FADE_MS)
    return () => {
      clearTimeout(fade)
      clearTimeout(done)
    }
  }, [])

  if (phase === 'done') return null
  return (
    <div className={'splash' + (phase === 'fade' ? ' fade' : '')} role="img" aria-label="Don't Waste It! Share excess food. Feed our community.">
      <img src="/splash.jpg" alt="" />
    </div>
  )
}
