import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

export default function Login() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        sessionStorage.setItem('rhbl_auth', '1')
        router.push('/')
      } else {
        setError(json.error || 'Invalid username or password')
      }
    } catch {
      setError('Network error. Please try again.')
    }
    setLoading(false)
  }

  return (
    <>
      <Head>
        <title>Login · Remark Order Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #04070f; --s1: #070c18; --s2: #0a1020;
          --border: #162030; --border2: #1e2d45;
          --cyan: #00e5ff; --purple: #6d28d9;
          --text: #c8deff; --muted: #3d5570;
        }
        html, body {
          background: var(--bg); color: var(--text);
          font-family: 'Outfit', sans-serif; min-height: 100vh;
          -webkit-font-smoothing: antialiased;
        }
        body::before {
          content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background:
            radial-gradient(ellipse 70% 60% at 15% 10%, rgba(109,40,217,.15) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 85% 90%, rgba(0,229,255,.1) 0%, transparent 60%),
            repeating-linear-gradient(0deg, rgba(0,229,255,.016) 0, rgba(0,229,255,.016) 1px, transparent 1px, transparent 52px),
            repeating-linear-gradient(90deg, rgba(0,229,255,.016) 0, rgba(0,229,255,.016) 1px, transparent 1px, transparent 52px);
        }
        .page {
          position: relative; z-index: 1; min-height: 100vh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; padding: 24px 16px;
        }
        .box {
          width: 100%; max-width: 420px;
          background: rgba(10,16,32,.88);
          border: 1px solid var(--border2); border-radius: 20px;
          padding: clamp(28px,6vw,44px); backdrop-filter: blur(16px);
          box-shadow: 0 24px 80px rgba(0,0,0,.4), 0 0 0 1px rgba(0,229,255,.04);
        }
        .logo-wrap { text-align: center; margin-bottom: 28px; }
        .logo-icon {
          width: 62px; height: 62px; border-radius: 16px; margin: 0 auto 14px;
          background: linear-gradient(135deg, var(--purple), var(--cyan));
          display: flex; align-items: center; justify-content: center;
          font-size: 1.7rem; box-shadow: 0 8px 32px rgba(0,229,255,.2);
        }
        .logo-title {
          font-size: clamp(.95rem, 4vw, 1.1rem); font-weight: 800;
          color: #e8f4ff; letter-spacing: -.01em; line-height: 1.35; margin-bottom: 6px;
        }
        .logo-sub { font-family: 'Space Mono',monospace; font-size: .62rem; color: var(--muted); letter-spacing: .06em; }
        .divider { height: 1px; background: var(--border2); margin: 22px 0; }
        .fld { margin-bottom: 15px; }
        .fld-lbl { display: block; font-family: 'Space Mono',monospace; font-size: .6rem; color: var(--muted); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 7px; }
        .inp-wrap { position: relative; }
        .fld input {
          width: 100%; background: var(--s1); border: 1px solid var(--border2);
          border-radius: 10px; padding: 13px 16px; color: var(--text);
          font-family: 'Space Mono',monospace; font-size: .82rem; outline: none;
          transition: border-color .2s, box-shadow .2s; -webkit-appearance: none;
        }
        .fld input:focus { border-color: var(--cyan); box-shadow: 0 0 0 3px rgba(0,229,255,.1); }
        .fld input::placeholder { color: var(--muted); }
        .show-btn {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: var(--muted); font-size: 1rem; padding: 4px;
          transition: color .2s; line-height: 1;
        }
        .show-btn:hover { color: var(--cyan); }
        .err-box {
          background: rgba(239,68,68,.07); border: 1px solid rgba(239,68,68,.2);
          border-radius: 9px; padding: 11px 14px; margin-bottom: 14px;
          font-family: 'Space Mono',monospace; font-size: .7rem; color: #ef4444;
          display: flex; align-items: center; gap: 8px;
        }
        .btn-login {
          width: 100%; padding: 14px; border: none; border-radius: 10px;
          background: linear-gradient(135deg, var(--purple), var(--cyan));
          color: #fff; font-family: 'Outfit',sans-serif; font-size: .95rem; font-weight: 700;
          cursor: pointer; transition: all .22s; position: relative; overflow: hidden;
          letter-spacing: .02em; margin-top: 4px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .btn-login:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 36px rgba(0,229,255,.25); }
        .btn-login:disabled { opacity: .5; cursor: not-allowed; transform: none; }
        .btn-login::after {
          content: ''; position: absolute; top: 0; left: -100%; width: 50%; height: 100%;
          background: linear-gradient(90deg,transparent,rgba(255,255,255,.14),transparent);
          transition: left .5s;
        }
        .btn-login:hover::after { left: 150%; }
        .spin { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .footer { margin-top: 28px; text-align: center; font-family: 'Space Mono',monospace; font-size: .6rem; color: var(--muted); line-height: 1.9; letter-spacing: .04em; }
        .footer strong { color: rgba(0,229,255,.65); }
      `}</style>

      <div className="page">
        <div className="box">
          <div className="logo-wrap">
            <div className="logo-icon">📊</div>
            <div className="logo-title">Remark Order Dashboard<br/>Data Upload</div>
            <div className="logo-sub">// Secure Login Required</div>
          </div>

          <div className="divider"/>

          {error && <div className="err-box"><span>⚠️</span>{error}</div>}

          <form onSubmit={handleLogin}>
            <div className="fld">
              <label className="fld-lbl">Username</label>
              <div className="inp-wrap">
                <input type="text" placeholder="Enter username"
                       value={username} onChange={e=>{setUsername(e.target.value);setError('')}}
                       autoComplete="username" required/>
              </div>
            </div>
            <div className="fld">
              <label className="fld-lbl">Password</label>
              <div className="inp-wrap">
                <input type={showPass?'text':'password'} placeholder="Enter password"
                       value={password} onChange={e=>{setPassword(e.target.value);setError('')}}
                       autoComplete="current-password" style={{paddingRight:'44px'}} required/>
                <button type="button" className="show-btn" onClick={()=>setShowPass(v=>!v)}>
                  {showPass?'🙈':'👁️'}
                </button>
              </div>
            </div>
            <button className="btn-login" type="submit" disabled={loading||!username||!password}>
              {loading?<><div className="spin"/>Logging in…</>:'🔐 Login'}
            </button>
          </form>
        </div>

        <div className="footer">
          Developed By <strong>Dipta Saha</strong><br/>
          M2426 · 01720920910
        </div>
      </div>
    </>
  )
}
