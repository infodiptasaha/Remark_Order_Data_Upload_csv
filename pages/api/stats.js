import clientPromise from '../../lib/mongodb'

// Parse "14 May 2026" → Date object
function parseOrderDate(str) {
  if (!str) return null
  const months = {
    'January':0,'February':1,'March':2,'April':3,'May':4,'June':5,
    'July':6,'August':7,'September':8,'October':9,'November':10,'December':11,
    'Jan':0,'Feb':1,'Mar':2,'Apr':3,'Jun':5,'Jul':6,'Aug':7,'Sep':8,'Oct':9,'Nov':10,'Dec':11
  }
  // Handle "14 May 2026"
  const m1 = str.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/)
  if (m1) {
    const [,day,mon,year] = m1
    return new Date(parseInt(year), months[mon] ?? 0, parseInt(day))
  }
  // Handle "14-May-26"
  const m2 = str.match(/^(\d{1,2})-(\w+)-(\d{2})$/)
  if (m2) {
    const [,day,mon,yr] = m2
    return new Date(2000+parseInt(yr), months[mon] ?? 0, parseInt(day))
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { collection } = req.body
  if (!collection) return res.status(400).json({ error: 'collection required' })

  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGODB_DB)
    const col = db.collection(collection)

    const totalDocs = await col.countDocuments()

    const isOrderData = collection === 'ORDER_DATA'
    const dateField = isOrderData ? 'OrderDate' : '_uploadDate'

    const allDates = await col.distinct(dateField, { [dateField]: { $exists: true, $ne: null } })

    let oldestDate = 'N/A'
    let newestDate = 'N/A'
    let availableDates = []

    if (allDates.length > 0) {
      if (isOrderData) {
        const sorted = allDates
          .map(d => ({ raw: d, parsed: parseOrderDate(d) }))
          .filter(d => d.parsed !== null)
          .sort((a, b) => a.parsed - b.parsed)
        if (sorted.length > 0) {
          oldestDate = sorted[0].raw
          newestDate = sorted[sorted.length - 1].raw
          availableDates = sorted.map(d => d.raw)
        }
      } else {
        const sorted = [...allDates].sort()
        oldestDate = sorted[0]
        newestDate = sorted[sorted.length - 1]
        availableDates = sorted
      }
    }

    // Data size
    let displaySize = 'N/A'
    try {
      const cStats = await db.command({ collStats: collection, scale: 1 })
      const bytes = cStats.storageSize || cStats.size || 0
      displaySize = bytes >= 1024*1024
        ? `${(bytes/(1024*1024)).toFixed(2)} MB`
        : bytes >= 1024
          ? `${(bytes/1024).toFixed(1)} KB`
          : `${bytes} B`
    } catch {
      const est = totalDocs * 500
      displaySize = est >= 1024*1024
        ? `~${(est/(1024*1024)).toFixed(2)} MB`
        : `~${(est/1024).toFixed(1)} KB`
    }

    return res.status(200).json({
      success: true, totalDocs, oldestDate, newestDate,
      availableDates, dataSize: displaySize, dateField,
    })
  } catch (err) {
    console.error('Stats error:', err)
    return res.status(500).json({ error: err.message })
  }
}
