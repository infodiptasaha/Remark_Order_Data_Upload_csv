import clientPromise from '../../lib/mongodb'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { collection, documents } = req.body

  if (!collection || !Array.isArray(documents) || documents.length === 0) {
    return res.status(400).json({ error: 'collection and documents[] are required' })
  }

  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGODB_DB)
    const col = db.collection(collection)

    const result = await col.insertMany(documents, { ordered: false })

    return res.status(200).json({
      success: true,
      insertedCount: result.insertedCount,
    })
  } catch (err) {
    console.error('MongoDB error:', err)
    return res.status(500).json({ error: err.message })
  }
}
