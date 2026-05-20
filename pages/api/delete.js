import clientPromise from '../../lib/mongodb'

// Convert "2026-05-14" → "14 May 2026"
function toOrderDateFormat(dateStr) {
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']
  const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun',
                       'Jul','Aug','Sep','Oct','Nov','Dec']
  const [year, month, day] = dateStr.split('-')
  const monthIdx = parseInt(month, 10) - 1
  const dd = parseInt(day, 10)
  // Try both formats
  return {
    full:  `${dd} ${months[monthIdx]} ${year}`,      // "14 May 2026"
    short: `${dd}-${shortMonths[monthIdx]}-${year.slice(2)}`, // "14-May-26"
    iso:   dateStr,                                    // "2026-05-14"
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { collection, date } = req.body
  if (!collection || !date) return res.status(400).json({ error: 'collection and date are required' })

  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGODB_DB)
    const col = db.collection(collection)

    let result
    let matchedFormat = ''

    if (collection === 'ORDER_DATA') {
      const formats = toOrderDateFormat(date)
      // Use regex to handle any invisible chars/spaces
      const dayNum = parseInt(date.split('-')[2], 10)
      const monName = formats.full.split(' ')[1] // "May"
      const yearNum = date.split('-')[0]           // "2026"
      result = await col.deleteMany({
        OrderDate: { $regex: `^\\s*${dayNum}\\s+${monName}\\s+${yearNum}\\s*$`, $options: 'i' }
      })
      matchedFormat = formats.full
    } else {
      result = await col.deleteMany({ _uploadDate: date })
      matchedFormat = date
    }

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
