export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' })

  const validUsers = [
    { username: process.env.AUTH_USER_1, password: process.env.AUTH_PASS_1 },
    { username: process.env.AUTH_USER_2, password: process.env.AUTH_PASS_2 },
  ].filter(u => u.username && u.password)

  const match = validUsers.find(u => u.username === username && u.password === password)

  if (match) {
    return res.status(200).json({ success: true })
  } else {
    return res.status(401).json({ error: 'Invalid username or password' })
  }
}
