import clientPromise from '../../lib/mongodb'

// Convert "2026-05-15" → "15-May-26"
function formatDate(dateStr) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [year, month, day] = dateStr.split('-')
  const mm = months[parseInt(month, 10) - 1]
  const yy = year.slice(2)
  const dd = parseInt(day, 10).toString() // removes leading zero: "05" → "5", "15" → "15"
  return `${dd}-${mm}-${yy}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { collection, date } = req.body
  if (!collection || !date) {
    return res.status(400).json({ error: 'collection and date are required' })
  }

  const formatted = formatDate(date) // e.g. "15-May-26"

  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGODB_DB)
    const col = db.collection(collection)

    const result = await col.deleteMany({ OrderDate: formatted })

    return res.status(200).json({
      success: true,
      deletedCount: result.deletedCount,
      matchedFormat: formatted,
    })
  } catch (err) {
    console.error('MongoDB delete error:', err)
    return res.status(500).json({ error: err.message })
  }
}
