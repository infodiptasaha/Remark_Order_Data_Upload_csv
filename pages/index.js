import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  // Skip first 4 rows (report title, blank, date range, blank)
  // Row 5 (index 4) is the actual header
  const dataLines = lines.slice(4)
  if (dataLines.length < 2) return { headers: [], rows: [] }
  const headers = dataLines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').replace(/^\uFEFF/, ''))
  // Remove last empty column if exists
  const cleanHeaders = headers[headers.length - 1] === '' ? headers.slice(0, -1) : headers
  const rows = dataLines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || []
    const obj = {}
    cleanHeaders.forEach((h, i) => {
      let v = (vals[i] || '').trim().replace(/^"|"$/g, '')
      const n = Number(v)
      obj[h] = v === '' ? null : isNaN(n) ? v : n
    })
    return obj
  })
  return { headers: cleanHeaders, rows }
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const COLLECTIONS = ['ORDER_DATA', 'SALES_DATA']
const TABS = [
  { id: 'upload', label: 'Upload CSV',  icon: '⬆️' },
  { id: 'stats',  label: 'DB Stats',    icon: '📊' },
  { id: 'delete', label: 'Delete Data', icon: '🗑️' },
]

const REQUIRED_HEADERS = [
  'Region','Area','Territory','Town Code','SAP Code','Town','OrderDate',
  'SO Code','SO Name','Route Code','Route Name','Outlet Code','Outlet Name',
  'Brand Name','SKU Code','Order SKU Name','Order in Pcs','Free in PCS',
  'Order Gross Value(TP)','Free Order Value(TP)','Discount',
  'Net Order Value(TP)','BusinessType'
]

function validateHeaders(headers) {
  const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h))
  const extra   = headers.filter(h => !REQUIRED_HEADERS.includes(h))
  return { valid: missing.length === 0, missing, extra }
}

export default function Home() {
  const router = useRouter()

  // ── auth guard ──
  useEffect(() => {
    if (typeof window !== 'undefined' && !sessionStorage.getItem('rhbl_auth')) {
      router.replace('/login')
    }
  }, [])

  const logout = () => {
    sessionStorage.removeItem('rhbl_auth')
    router.replace('/login')
  }
  const [file, setFile]                   = useState(null)
  const [headers, setHeaders]             = useState([])
  const [rows, setRows]                   = useState([])
  const [collection, setCollection]       = useState('')
  const [batchSize, setBatchSize]         = useState(100)
  const [dragging, setDragging]           = useState(false)
  const [logs, setLogs]                   = useState([])
  const [progress, setProgress]           = useState(0)
  const [busy, setBusy]                   = useState(false)
  const [result, setResult]               = useState(null)
  const logRef                            = useRef(null)
  const [delCollection, setDelCollection] = useState('')
  const [delDate, setDelDate]             = useState('')
  const [delBusy, setDelBusy]             = useState(false)
  const [delResult, setDelResult]         = useState(null)
  const [statsCol, setStatsCol]           = useState('')
  const [statsBusy, setStatsBusy]         = useState(false)
  const [stats, setStats]                 = useState(null)
  const [statsErr, setStatsErr]           = useState('')
  const [tab, setTab]                     = useState('upload')
  const [sideOpen, setSideOpen]           = useState(false)
  const [headerError, setHeaderError]     = useState('')

  const addLog = useCallback((msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString('en-GB')
    setLogs(l => [...l, { ts, msg, type }])
    setTimeout(() => logRef.current?.scrollTo(0, 9999), 50)
  }, [])

  const handleFile = useCallback((f) => {
    if (!f?.name.endsWith('.csv')) return alert('Only .csv files allowed')
    const reader = new FileReader()
    reader.onload = e => {
      const { headers, rows } = parseCSV(e.target.result)
      setHeaderError('')

      // ── Header Validation ──
      const { valid, missing, extra } = validateHeaders(headers)
      if (!valid) {
        setFile(null); setHeaders([]); setRows([])
        setHeaderError(
          `❌ CSV header match হয়নি!\n` +
          (missing.length ? `Missing columns (${missing.length}): ${missing.join(', ')}` : '') +
          (extra.length   ? `\nExtra columns (${extra.length}): ${extra.join(', ')}` : '')
        )
        return
      }

      setFile(f); setHeaders(headers); setRows(rows)
      setLogs([]); setProgress(0); setResult(null)
    }
    reader.readAsText(f)
  }, [])

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  const upload = async () => {
    if (!rows.length || !collection.trim()) return
    setBusy(true); setLogs([]); setProgress(0); setResult(null)
    const batches = chunk(rows, batchSize)
    addLog(`Upload শুরু · ${rows.length} rows · ${batches.length} batch`, 'info')
    let inserted = 0, failed = 0
    for (let i = 0; i < batches.length; i++) {
      setProgress(Math.round((i / batches.length) * 100))
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collection: collection.trim(), documents: batches[i] }),
        })
        const json = await res.json()
        if (!res.ok) { addLog(`Batch ${i+1} failed: ${json.error}`, 'err'); failed += batches[i].length }
        else { addLog(`Batch ${i+1} ✓ — ${json.insertedCount} rows`, 'ok'); inserted += json.insertedCount }
      } catch (e) { addLog(`Batch ${i+1} error: ${e.message}`, 'err'); failed += batches[i].length }
    }
    setProgress(100); setBusy(false)
    setResult(failed === 0
      ? { ok: true, title: `✅ ${inserted.toLocaleString()} rows inserted`, body: `Collection: "${collection}" · ${batches.length} batch(es)` }
      : { ok: false, title: `⚠️ ${inserted} ok · ${failed} failed`, body: 'Log দেখো details এর জন্য' })
  }

  const fetchStats = async () => {
    if (!statsCol) return
    setStatsBusy(true); setStats(null); setStatsErr('')
    try {
      const res = await fetch('/api/stats', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: statsCol }),
      })
      const json = await res.json()
      if (!res.ok) setStatsErr(json.error); else setStats(json)
    } catch (e) { setStatsErr(e.message) }
    setStatsBusy(false)
  }

  const deleteByDate = async () => {
    if (!delCollection || !delDate) return
    if (!confirm(`⚠️ "${delCollection}" থেকে "${delDate}" এর সব data delete হবে। নিশ্চিত?`)) return
    setDelBusy(true); setDelResult(null)
    try {
      const res = await fetch('/api/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: delCollection, date: delDate }),
      })
      const json = await res.json()
      if (!res.ok) setDelResult({ ok: false, title: '❌ Error', body: json.error })
      else setDelResult({ ok: json.deletedCount > 0, title: `🗑️ ${json.deletedCount} rows deleted`, body: `Collection: "${delCollection}" · Format: ${json.matchedFormat}` })
    } catch (e) { setDelResult({ ok: false, title: '❌ Network error', body: e.message }) }
    setDelBusy(false)
  }

  const switchTab = (id) => { setTab(id); setSideOpen(false) }

  return (
    <>
      <Head>
        <title>RHBL · Data Manager</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:      #04070f;
          --s1:      #070c18;
          --s2:      #0a1020;
          --border:  #162030;
          --border2: #1e2d45;
          --cyan:    #00e5ff;
          --purple:  #6d28d9;
          --green:   #10b981;
          --red:     #ef4444;
          --text:    #c8deff;
          --muted:   #3d5570;
          --mono:    'Space Mono', monospace;
          --sans:    'Outfit', sans-serif;
          --r:       12px;
        }

        html { font-size: 16px; }
        body {
          background: var(--bg); color: var(--text);
          font-family: var(--sans); min-height: 100vh;
          overflow-x: hidden; -webkit-font-smoothing: antialiased;
        }

        body::before {
          content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background:
            radial-gradient(ellipse 80% 50% at 10% 0%, rgba(109,40,217,.12) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 90% 100%, rgba(0,229,255,.08) 0%, transparent 60%),
            repeating-linear-gradient(0deg,   rgba(0,229,255,.016) 0, rgba(0,229,255,.016) 1px, transparent 1px, transparent 52px),
            repeating-linear-gradient(90deg,  rgba(0,229,255,.016) 0, rgba(0,229,255,.016) 1px, transparent 1px, transparent 52px);
        }

        /* ── TOPBAR ── */
        .topbar {
          position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; gap: 12px;
          padding: 0 20px; height: 56px;
          background: rgba(4,7,15,.92); backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--border);
        }
        .tb-menu {
          display: none; background: none; border: none;
          color: var(--muted); cursor: pointer; padding: 6px;
          font-size: 1.2rem; line-height: 1; border-radius: 6px;
          transition: color .2s;
        }
        .tb-menu:hover { color: var(--cyan); }
        @media(max-width: 767px) { .tb-menu { display: flex; } }
        .tb-logo {
          display: flex; align-items: center; gap: 8px;
          font-family: var(--mono); font-size: .72rem; font-weight: 700;
          color: var(--cyan); letter-spacing: .1em; flex: 1;
        }
        .tb-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--cyan); box-shadow: 0 0 8px var(--cyan);
          animation: pulse 2s ease infinite; flex-shrink: 0;
        }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.75)} }
        .tb-badge {
          font-family: var(--mono); font-size: .6rem; color: var(--muted);
          border: 1px solid var(--border2); border-radius: 6px;
          padding: 3px 9px; letter-spacing: .06em; white-space: nowrap;
        }
        @media(max-width: 400px) { .tb-badge { display: none; } }

        /* ── LAYOUT ── */
        .app { display: flex; position: relative; z-index: 1; min-height: calc(100vh - 56px); }

        /* ── SIDEBAR ── */
        .sidebar {
          width: 210px; flex-shrink: 0;
          border-right: 1px solid var(--border);
          background: rgba(7,12,24,.7);
          padding: 24px 12px;
          position: sticky; top: 56px;
          height: calc(100vh - 56px); overflow-y: auto;
        }
        @media(max-width: 767px) {
          .sidebar {
            position: fixed; top: 56px; left: 0; bottom: 0; z-index: 50;
            transform: translateX(-100%); transition: transform .28s cubic-bezier(.4,0,.2,1);
            width: 220px; height: calc(100vh - 56px);
          }
          .sidebar.open { transform: translateX(0); box-shadow: 8px 0 32px rgba(0,0,0,.5); }
        }
        .overlay {
          display: none; position: fixed; inset: 0; z-index: 40;
          background: rgba(0,0,0,.5); backdrop-filter: blur(2px);
        }
        @media(max-width: 767px) { .overlay.show { display: block; } }

        .side-lbl {
          font-family: var(--mono); font-size: .55rem; letter-spacing: .14em;
          color: var(--muted); text-transform: uppercase;
          padding: 0 10px; margin-bottom: 8px;
        }
        .nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 12px; border-radius: 10px; cursor: pointer;
          font-size: .875rem; font-weight: 500; color: var(--muted);
          transition: all .18s; margin-bottom: 3px; border: 1px solid transparent;
          user-select: none;
        }
        .nav-item:hover { color: var(--text); background: var(--s2); }
        .nav-item.active { color: var(--cyan); background: rgba(0,229,255,.07); border-color: rgba(0,229,255,.14); }

        /* ── BOTTOM NAV (mobile) ── */
        .bot-nav {
          display: none; position: fixed; bottom: 0; left: 0; right: 0; z-index: 30;
          background: rgba(4,7,15,.95); backdrop-filter: blur(16px);
          border-top: 1px solid var(--border);
          padding: 0 0 env(safe-area-inset-bottom,0);
        }
        @media(max-width: 767px) { .bot-nav { display: flex; } }
        .bot-tab {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          gap: 3px; padding: 10px 4px 8px; cursor: pointer;
          font-size: .62rem; font-weight: 600; color: var(--muted);
          border-top: 2px solid transparent; transition: all .18s; user-select: none;
        }
        .bot-tab .bi { font-size: 1.1rem; }
        .bot-tab.active { color: var(--cyan); border-color: var(--cyan); }

        /* ── CONTENT ── */
        .content {
          flex: 1; padding: 32px 28px 100px; max-width: 860px; min-width: 0;
        }
        @media(max-width: 900px)  { .content { padding: 24px 20px 100px; } }
        @media(max-width: 480px)  { .content { padding: 18px 14px 100px; } }

        /* ── SECTION HEAD ── */
        .sec-head { margin-bottom: 22px; }
        .sec-title { font-size: clamp(1.2rem, 4vw, 1.5rem); font-weight: 800; letter-spacing: -.02em; color: #e8f4ff; margin-bottom: 3px; }
        .sec-sub { font-family: var(--mono); font-size: clamp(.62rem, 2vw, .7rem); color: var(--muted); }

        /* ── CARD ── */
        .card { background: var(--s2); border: 1px solid var(--border2); border-radius: var(--r); padding: clamp(16px,3vw,22px); margin-bottom: 14px; }
        .card-head {
          font-family: var(--mono); font-size: .58rem; letter-spacing: .14em;
          color: var(--muted); text-transform: uppercase; margin-bottom: 14px;
          display: flex; align-items: center; gap: 7px;
        }
        .card-head::before { content:''; display:inline-block; width:3px; height:11px; background:var(--cyan); border-radius:2px; }

        /* ── GRID ── */
        .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media(max-width: 520px) { .g2 { grid-template-columns: 1fr; } }
        .g4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
        @media(max-width: 640px) { .g4 { grid-template-columns: 1fr 1fr; } }
        @media(max-width: 360px) { .g4 { grid-template-columns: 1fr; } }

        /* ── FIELDS ── */
        .fld { display: flex; flex-direction: column; gap: 5px; }
        .fld-lbl { font-family: var(--mono); font-size: .6rem; color: var(--muted); letter-spacing: .08em; text-transform: uppercase; }
        .fld input, .fld select {
          background: var(--s1); border: 1px solid var(--border2);
          border-radius: 9px; padding: clamp(9px,2vw,11px) 14px; color: var(--text);
          font-family: var(--mono); font-size: clamp(.75rem,2vw,.82rem);
          outline: none; transition: border-color .18s, box-shadow .18s; width: 100%;
          -webkit-appearance: none; appearance: none;
        }
        .fld input:focus, .fld select:focus { border-color: var(--cyan); box-shadow: 0 0 0 3px rgba(0,229,255,.08); }
        .fld select {
          cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%2300e5ff' d='M5 6L0 0h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center;
          padding-right: 32px;
        }
        input[type=date] { color-scheme: dark; }
        input[type=number] { -moz-appearance: textfield; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }

        /* ── BUTTONS ── */
        .btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          padding: clamp(11px,2.5vw,13px) clamp(16px,3vw,24px);
          border: none; border-radius: 9px;
          font-family: var(--sans); font-size: clamp(.82rem,2.5vw,.9rem); font-weight: 700;
          cursor: pointer; transition: all .2s; position: relative; overflow: hidden;
          letter-spacing: .01em; touch-action: manipulation;
        }
        .btn:disabled { opacity: .4; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
        .btn-primary { width: 100%; background: linear-gradient(135deg,#3b0f8c,var(--cyan)); color: #fff; }
        .btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,229,255,.22); }
        .btn-cyan { background: rgba(0,229,255,.1); border: 1px solid rgba(0,229,255,.25); color: var(--cyan); }
        .btn-cyan:hover:not(:disabled) { background: rgba(0,229,255,.18); }
        .btn-danger { width: 100%; background: linear-gradient(135deg,#7f1d1d,#dc2626); color: #fff; }
        .btn-danger:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(239,68,68,.25); }
        .btn-primary::after, .btn-danger::after {
          content: ''; position: absolute; top: 0; left: -100%; width: 50%; height: 100%;
          background: linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent);
          transition: left .5s;
        }
        .btn-primary:hover::after, .btn-danger:hover::after { left: 150%; }

        /* ── PROGRESS ── */
        .prog { margin-top: 12px; }
        .prog-row { display: flex; justify-content: space-between; font-family: var(--mono); font-size: .65rem; color: var(--muted); margin-bottom: 5px; }
        .prog-track { height: 4px; background: var(--border); border-radius: 99px; overflow: hidden; }
        .prog-bar { height: 100%; border-radius: 99px; transition: width .35s; background: linear-gradient(90deg,var(--purple),var(--cyan)); }

        /* ── LOG ── */
        .logbox {
          margin-top: 12px; background: var(--s1); border: 1px solid var(--border);
          border-radius: 9px; padding: 12px; font-family: var(--mono);
          font-size: clamp(.62rem,2vw,.7rem); max-height: 170px; overflow-y: auto; line-height: 1.8;
          -webkit-overflow-scrolling: touch;
        }
        .ll { display: flex; gap: 8px; }
        .ll .ts  { color: var(--muted); flex-shrink: 0; }
        .ll .ok  { color: var(--green); }
        .ll .err { color: var(--red); }
        .ll .info{ color: var(--cyan); }

        /* ── ALERT ── */
        .alert { margin-top: 12px; padding: 13px 16px; border-radius: 9px; }
        .alert.ok  { background: rgba(16,185,129,.07); border: 1px solid rgba(16,185,129,.2);  color: var(--green); }
        .alert.err { background: rgba(239,68,68,.07);  border: 1px solid rgba(239,68,68,.2);   color: var(--red); }
        .alert-t { font-weight: 700; font-size: clamp(.82rem,2.5vw,.9rem); margin-bottom: 3px; }
        .alert-b { font-family: var(--mono); font-size: clamp(.65rem,2vw,.72rem); opacity: .8; word-break: break-word; }

        /* ── STAT CARDS ── */
        .stat-card {
          background: var(--s1); border: 1px solid var(--border2);
          border-radius: 11px; padding: clamp(14px,3vw,18px) clamp(10px,2vw,14px);
          text-align: center; transition: border-color .18s;
        }
        .stat-card:hover { border-color: rgba(0,229,255,.25); }
        .stat-icon { font-size: clamp(1.1rem,3vw,1.4rem); margin-bottom: 8px; }
        .stat-lbl { font-family: var(--mono); font-size: clamp(.52rem,1.5vw,.58rem); color: var(--muted); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 6px; }
        .stat-val { font-family: var(--mono); font-size: clamp(.82rem,2.5vw,.95rem); font-weight: 700; color: var(--cyan); word-break: break-all; }

        /* ── WARN BOX ── */
        .warn-box {
          background: rgba(239,68,68,.05); border: 1px solid rgba(239,68,68,.15);
          border-radius: 8px; padding: 11px 14px; margin-bottom: 14px;
          font-family: var(--mono); font-size: clamp(.62rem,2vw,.7rem);
          color: rgba(239,68,68,.8); line-height: 1.6;
        }

        /* ── hide Vercel toolbar & timer ── */
        vercel-live-feedback, [data-vercel-toolbar], nextjs-portal { display: none !important; }

        /* ── compact drop zone row ── */
        .dz-row { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
        .dz-compact {
          position: relative; cursor: pointer; flex-shrink: 0;
          background: var(--s2); border: 1.5px dashed var(--border2);
          border-radius: 10px; padding: 10px 18px;
          display: flex; align-items: center; gap: 10px;
          transition: all .2s; white-space: nowrap;
        }
        .dz-compact:hover, .dz-compact.drag { border-color: var(--cyan); background: rgba(0,229,255,.04); }
        .dz-compact input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
        .dz-compact-icon { font-size: 1.2rem; }
        .dz-compact-text { display: flex; flex-direction: column; gap: 1px; }
        .dz-compact-title { font-size: .8rem; font-weight: 700; color: #e8f4ff; }
        .dz-compact-sub { font-family: var(--mono); font-size: .6rem; color: var(--muted); }
        .dz-file-info {
          flex: 1; background: rgba(0,229,255,.06); border: 1px solid rgba(0,229,255,.15);
          border-radius: 9px; padding: 9px 14px;
          font-family: var(--mono); font-size: .72rem; color: var(--cyan);
          display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden;
        }
        .dz-file-info span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dz-placeholder { flex: 1; font-family: var(--mono); font-size: .7rem; color: var(--muted); }
        @media(max-width: 480px) { .dz-row { flex-direction: column; align-items: stretch; } .dz-compact { justify-content: center; } }

        /* ── bigger preview table ── */
        .tscroll { overflow-x: auto; border-radius: 9px; border: 1px solid var(--border); -webkit-overflow-scrolling: touch; }
        .tscroll table { width: 100%; border-collapse: collapse; font-family: var(--mono); font-size: clamp(.72rem,2vw,.82rem); }
        .tscroll th { background: rgba(0,229,255,.06); color: var(--cyan); padding: 12px 16px; text-align: left; white-space: nowrap; border-bottom: 1px solid var(--border); font-weight: 700; letter-spacing:.04em; }
        .tscroll td { padding: 11px 16px; color: var(--text); border-bottom: 1px solid var(--border); white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
        .tscroll tr:last-child td { border-bottom: none; }
        .tscroll tr:nth-child(even) td { background: rgba(255,255,255,.015); }
        .tscroll tr:hover td { background: rgba(0,229,255,.03); }

        /* scrollbar */
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 99px; }
      `}</style>

      {/* overlay for mobile sidebar */}
      <div className={`overlay${sideOpen?' show':''}`} onClick={()=>setSideOpen(false)}/>

      {/* ── TOP BAR ── */}
      <div className="topbar">
        <button className="tb-menu" onClick={()=>setSideOpen(v=>!v)} aria-label="Menu">
          {sideOpen ? '✕' : '☰'}
        </button>
        <div className="tb-logo">
          <span className="tb-dot"/>
          RHBL · DATA MANAGER
        </div>
        <div className="tb-badge">MongoDB · Vercel</div>
        <button onClick={logout} style={{
          background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)',
          borderRadius:'7px', color:'#ef4444', fontFamily:'var(--mono)',
          fontSize:'.62rem', padding:'5px 12px', cursor:'pointer', letterSpacing:'.06em',
          transition:'all .2s', whiteSpace:'nowrap'
        }}
        onMouseOver={e=>e.target.style.background='rgba(239,68,68,.2)'}
        onMouseOut={e=>e.target.style.background='rgba(239,68,68,.1)'}
        >🚪 Logout</button>
      </div>

      <div className="app">
        {/* ── SIDEBAR ── */}
        <nav className={`sidebar${sideOpen?' open':''}`}>
          <div className="side-lbl">Navigation</div>
          {TABS.map(t => (
            <div key={t.id} className={`nav-item${tab===t.id?' active':''}`} onClick={()=>switchTab(t.id)}>
              <span>{t.icon}</span>{t.label}
            </div>
          ))}
        </nav>

        {/* ── MAIN CONTENT ── */}
        <div className="content">

          {/* ══ UPLOAD TAB ══ */}
          {tab === 'upload' && <>
            <div className="sec-head">
              <div className="sec-title">Upload CSV</div>
              <div className="sec-sub">// CSV file select → MongoDB insert</div>
            </div>

            <div className="card">
              <div className="card-head">Target Collection</div>
              <div className="g2">
                <div className="fld">
                  <span className="fld-lbl">Collection Name</span>
                  <select value={collection} onChange={e=>setCollection(e.target.value)}>
                    <option value="" disabled>Select collection…</option>
                    {COLLECTIONS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="fld">
                  <span className="fld-lbl">Batch Size (rows/request)</span>
                  <input type="number" min={1} max={1000} value={batchSize}
                         onChange={e=>setBatchSize(Number(e.target.value)||100)}/>
                </div>
              </div>
            </div>

            {/* Compact Drop Zone Row */}
            <div className="dz-row"
                 onDragOver={e=>{e.preventDefault();setDragging(true)}}
                 onDragLeave={()=>setDragging(false)}
                 onDrop={onDrop}>
              <div className={`dz-compact${dragging?' drag':''}`}>
                <input type="file" accept=".csv" onChange={e=>handleFile(e.target.files[0])}/>
                <div className="dz-compact-icon">{file?'✅':'📂'}</div>
                <div className="dz-compact-text">
                  <div className="dz-compact-title">Choose CSV</div>
                  <div className="dz-compact-sub">.csv only</div>
                </div>
              </div>
              {file
                ? <div className="dz-file-info">📄 <span>{file.name} · {rows.length.toLocaleString()} rows · {headers.length} cols</span></div>
                : <div className="dz-placeholder">← tap or drag your CSV file here</div>
              }
            </div>

            {/* Header Validation Error */}
            {headerError && (
              <div style={{
                background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.25)',
                borderRadius:'10px', padding:'14px 18px', marginBottom:'14px',
                fontFamily:'Space Mono,monospace', fontSize:'.72rem', color:'#ef4444',
                lineHeight:'1.8', whiteSpace:'pre-line'
              }}>
                {headerError}
                <div style={{marginTop:'10px', color:'rgba(239,68,68,.6)', fontSize:'.65rem'}}>
                  ✅ Required columns: {REQUIRED_HEADERS.join(' · ')}
                </div>
              </div>
            )}

            {headers.length > 0 && (
              <div className="card">
                <div className="card-head">Preview — first {Math.min(8,rows.length)} of {rows.length.toLocaleString()} rows · {headers.length} cols</div>
                <div className="tscroll">
                  <table>
                    <thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead>
                    <tbody>{rows.slice(0,8).map((r,i)=>(
                      <tr key={i}>{headers.map(h=><td key={h}>{r[h]??''}</td>)}</tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            <button className="btn btn-primary"
                    disabled={busy||!rows.length||!collection.trim()} onClick={upload}>
              {busy?'⏳ Uploading…':'⚡ Insert into MongoDB'}
            </button>

            {busy && (
              <div className="prog">
                <div className="prog-row"><span>Uploading…</span><span>{progress}%</span></div>
                <div className="prog-track"><div className="prog-bar" style={{width:`${progress}%`}}/></div>
              </div>
            )}

            {logs.length > 0 && (
              <div className="logbox" ref={logRef}>
                {logs.map((l,i)=>(
                  <div className="ll" key={i}>
                    <span className="ts">[{l.ts}]</span>
                    <span className={l.type}>{l.msg}</span>
                  </div>
                ))}
              </div>
            )}

            {result && (
              <div className={`alert ${result.ok?'ok':'err'}`}>
                <div className="alert-t">{result.title}</div>
                <div className="alert-b">{result.body}</div>
              </div>
            )}
          </>}

          {/* ══ STATS TAB ══ */}
          {tab === 'stats' && <>
            <div className="sec-head">
              <div className="sec-title">DB Stats</div>
              <div className="sec-sub">// Collection এর total rows, size, date range</div>
            </div>

            <div className="card">
              <div className="card-head">Select Collection</div>
              <div className="g2" style={{alignItems:'flex-end'}}>
                <div className="fld">
                  <span className="fld-lbl">Collection</span>
                  <select value={statsCol} onChange={e=>{setStatsCol(e.target.value);setStats(null);setStatsErr('')}}>
                    <option value="" disabled>Select collection…</option>
                    {COLLECTIONS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button className="btn btn-cyan" style={{height:'42px',whiteSpace:'nowrap'}}
                        disabled={statsBusy||!statsCol} onClick={fetchStats}>
                  {statsBusy?'⏳ Loading…':'🔍 Check Stats'}
                </button>
              </div>
            </div>

            {statsErr && <div className="alert err"><div className="alert-t">❌ Error</div><div className="alert-b">{statsErr}</div></div>}

            {stats && (
              <div className="g4">
                {[
                  {icon:'📋', label:'Total Rows',  val: stats.totalDocs?.toLocaleString()},
                  {icon:'💾', label:'Data Size',   val: stats.dataSize},
                  {icon:'📅', label:'Oldest Date', val: stats.oldestDate},
                  {icon:'🆕', label:'Newest Date', val: stats.newestDate},
                ].map(s=>(
                  <div className="stat-card" key={s.label}>
                    <div className="stat-icon">{s.icon}</div>
                    <div className="stat-lbl">{s.label}</div>
                    <div className="stat-val">{s.val}</div>
                  </div>
                ))}
              </div>
            )}
          </>}

          {/* ══ DELETE TAB ══ */}
          {tab === 'delete' && <>
            <div className="sec-head">
              <div className="sec-title">Delete Data</div>
              <div className="sec-sub">// নির্দিষ্ট তারিখের সব data delete করো</div>
            </div>

            <div className="card" style={{borderColor:'rgba(239,68,68,.2)'}}>
              <div className="card-head" style={{color:'var(--red)'}}>Delete by OrderDate</div>
              <div className="g2" style={{marginBottom:'14px'}}>
                <div className="fld">
                  <span className="fld-lbl">Collection</span>
                  <select value={delCollection} onChange={e=>setDelCollection(e.target.value)}>
                    <option value="" disabled>Select collection…</option>
                    {COLLECTIONS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="fld">
                  <span className="fld-lbl">Order Date</span>
                  <input type="date" value={delDate} onChange={e=>setDelDate(e.target.value)}/>
                </div>
              </div>
              <div className="warn-box">⚠️ এই action টা permanent — deleted data আর ফিরে পাওয়া যাবে না। Delete করার আগে নিশ্চিত হও।</div>
              <button className="btn btn-danger" disabled={delBusy||!delCollection||!delDate} onClick={deleteByDate}>
                {delBusy?'⏳ Deleting…':'🗑️ Delete Selected Date Data'}
              </button>
              {delResult && (
                <div className={`alert ${delResult.ok?'ok':'err'}`} style={{marginTop:'12px'}}>
                  <div className="alert-t">{delResult.title}</div>
                  <div className="alert-b">{delResult.body}</div>
                </div>
              )}
            </div>
          </>}

        </div>
      </div>

      {/* ── BOTTOM NAV (mobile) ── */}
      <div className="bot-nav">
        {TABS.map(t=>(
          <div key={t.id} className={`bot-tab${tab===t.id?' active':''}`} onClick={()=>setTab(t.id)}>
            <span className="bi">{t.icon}</span>
            {t.label}
          </div>
        ))}
      </div>

      {/* ── FOOTER ── */}
      <div style={{
        textAlign:'center', padding:'16px', borderTop:'1px solid var(--border)',
        fontFamily:'Space Mono,monospace', fontSize:'.6rem', color:'var(--muted)',
        letterSpacing:'.06em', lineHeight:1.8, position:'relative', zIndex:1,
        background:'rgba(4,7,15,.8)'
      }}>
        Developed By <span style={{color:'rgba(0,229,255,.7)'}}>Dipta Saha</span>
        {' · '} M2426 {' · '} 01720920910
      </div>
    </>
  )
}
