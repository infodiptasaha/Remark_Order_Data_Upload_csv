import clientPromise from '../../lib/mongodb'

// Parse "15-May-26" → Date object for sorting
function parseOrderDate(str) {
  if (!str) return null
  const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11}
  const parts = str.split('-')
  if (parts.length !== 3) return null
  const [day, mon, yr] = parts
  const fullYear = 2000 + parseInt(yr, 10)
  return new Date(fullYear, months[mon], parseInt(day, 10))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { collection } = req.body
  if (!collection) return res.status(400).json({ error: 'collection required' })

  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGODB_DB)
    const col = db.collection(collection)

    const totalDocs = await col.countDocuments()

    // Get all unique OrderDates and find oldest/newest by parsing
    const allDates = await col
      .distinct('OrderDate', { OrderDate: { $exists: true, $ne: null } })

    let oldestDate = 'N/A'
    let newestDate = 'N/A'

    if (allDates.length > 0) {
      const sorted = allDates
        .map(d => ({ raw: d, parsed: parseOrderDate(d) }))
        .filter(d => d.parsed !== null)
        .sort((a, b) => a.parsed - b.parsed)

      if (sorted.length > 0) {
        oldestDate = sorted[0].raw
        newestDate = sorted[sorted.length - 1].raw
      }
    }

    // Data size
    let displaySize = 'N/A'
    try {
      const cStats = await db.command({ collStats: collection, scale: 1 })
      const bytes = cStats.storageSize || cStats.size || 0
      if (bytes >= 1024 * 1024) {
        displaySize = `${(bytes / (1024 * 1024)).toFixed(2)} MB`
      } else if (bytes >= 1024) {
        displaySize = `${(bytes / 1024).toFixed(1)} KB`
      } else {
        displaySize = `${bytes} B`
      }
    } catch {
      const estimatedBytes = totalDocs * 500
      if (estimatedBytes >= 1024 * 1024) {
        displaySize = `~${(estimatedBytes / (1024 * 1024)).toFixed(2)} MB`
      } else {
        displaySize = `~${(estimatedBytes / 1024).toFixed(1)} KB`
      }
    }

    return res.status(200).json({
      success: true,
      totalDocs,
      oldestDate,
      newestDate,
      dataSize: displaySize,
    })
  } catch (err) {
    console.error('Stats error:', err)
    return res.status(500).json({ error: err.message })
  }
}
