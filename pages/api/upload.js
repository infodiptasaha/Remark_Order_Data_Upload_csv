import clientPromise from '../../lib/mongodb'

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
}

// Unique key config per collection
const UNIQUE_KEYS = {
  ORDER_DATA:       doc => `${doc['Town Code']}__${doc['OrderDate']}__${doc['Outlet Code']}__${doc['SKU Code']}__${doc['Order Gross Value(TP)']}`,
  SO_Data:          doc => `${doc['SRCode']}__${doc['ContactNo']}`,
  PJP_Data:         doc => `${doc['Code']}__${doc['RouteCode']}`,
  Target_Data_Town: doc => `${doc['DistributorCode']}__${doc['Town']}`,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { collection, documents } = req.body
  if (!collection || !Array.isArray(documents) || documents.length === 0)
    return res.status(400).json({ error: 'collection and documents[] are required' })

  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGODB_DB)
    const col = db.collection(collection)

    // Add upload date to every document
    const uploadDate = new Date().toISOString().split('T')[0] // "2026-05-18"
    const docsWithDate = documents.map(doc => ({ ...doc, _uploadDate: uploadDate }))

    // All collections — duplicate check
    const keyFn = UNIQUE_KEYS[collection]
    if (!keyFn) return res.status(400).json({ error: `Unknown collection: ${collection}` })

    const incomingKeys = docsWithDate.map(doc => keyFn(doc))
    let existingKeys = new Set()

    if (collection === 'ORDER_DATA') {
      // Query by Town Code + OrderDate combination (most selective filter)
      const townCodes   = [...new Set(docsWithDate.map(d => d['Town Code']).filter(Boolean))]
      const orderDates  = [...new Set(docsWithDate.map(d => d['OrderDate']).filter(Boolean))]
      const existing = await col.find(
        { 'Town Code': { $in: townCodes }, 'OrderDate': { $in: orderDates } },
        { projection: { 'Town Code':1, 'OrderDate':1, 'Outlet Code':1, 'SKU Code':1, 'Order Gross Value(TP)':1, _id:0 } }
      ).toArray()
      existing.forEach(d => existingKeys.add(
        `${d['Town Code']}__${d['OrderDate']}__${d['Outlet Code']}__${d['SKU Code']}__${d['Order Gross Value(TP)']}`
      ))
    }
    else if (collection === 'SO_Data') {
      const existing = await col.find(
        { SRCode: { $in: docsWithDate.map(d => d['SRCode']).filter(Boolean) } },
        { projection: { SRCode: 1, ContactNo: 1, _id: 0 } }
      ).toArray()
      existing.forEach(d => existingKeys.add(`${d['SRCode']}__${d['ContactNo']}`))
    }
    else if (collection === 'PJP_Data') {
      const existing = await col.find(
        { Code: { $in: docsWithDate.map(d => d['Code']).filter(Boolean) } },
        { projection: { Code: 1, RouteCode: 1, _id: 0 } }
      ).toArray()
      existing.forEach(d => existingKeys.add(`${d['Code']}__${d['RouteCode']}`))
    }
    else if (collection === 'Target_Data_Town') {
      const existing = await col.find(
        { DistributorCode: { $in: docsWithDate.map(d => d['DistributorCode']).filter(Boolean) } },
        { projection: { DistributorCode: 1, Town: 1, _id: 0 } }
      ).toArray()
      existing.forEach(d => existingKeys.add(`${d['DistributorCode']}__${d['Town']}`))
    }

    // Filter — only unique docs
    const uniqueDocs = docsWithDate.filter((doc, i) => !existingKeys.has(incomingKeys[i]))
    const duplicateCount = docsWithDate.length - uniqueDocs.length

    if (uniqueDocs.length === 0) {
      return res.status(200).json({
        success: true,
        insertedCount: 0,
        duplicateCount,
        skippedCount: duplicateCount,
        message: 'সব records আগেই আছে — কিছু insert হয়নি',
      })
    }

    const result = await col.insertMany(uniqueDocs, { ordered: false })
    return res.status(200).json({
      success: true,
      insertedCount: result.insertedCount,
      duplicateCount,
      skippedCount: duplicateCount,
    })

  } catch (err) {
    console.error('Upload error:', err)
    return res.status(500).json({ error: err.message })
  }
}
