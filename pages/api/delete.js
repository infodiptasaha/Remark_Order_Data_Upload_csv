import clientPromise from '../../lib/mongodb'

// Convert date picker "2026-05-15" → "15-May-26" for ORDER_DATA
function toOrderDateFormat(dateStr) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [year, month, day] = dateStr.split('-')
  const mm = months[parseInt(month, 10) - 1]
  const yy = year.slice(2)
  const dd = parseInt(day, 10).toString()
  return `${dd}-${mm}-${yy}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { collection, date } = req.body
  if (!collection || !date) return res.status(400).json({ error: 'collection and date are required' })

  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGODB_DB)
    const col = db.collection(collection)

    let query = {}
    let matchedFormat = ''

    if (collection === 'ORDER_DATA') {
      // OrderDate format: "17-May-26"
      matchedFormat = toOrderDateFormat(date)
      query = { OrderDate: matchedFormat }
    } else {
      // SO_Data, PJP_Data, Target_Data_Town use _uploadDate: "2026-05-18"
      matchedFormat = date
      query = { _uploadDate: date }
    }

    const result = await col.deleteMany(query)

    return res.status(200).json({
      success: true,
      deletedCount: result.deletedCount,
      matchedFormat,
    })
  } catch (err) {
    console.error('Delete error:', err)
    return res.status(500).json({ error: err.message })
  }
}
