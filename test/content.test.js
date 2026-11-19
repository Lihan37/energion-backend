import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { ObjectId } from 'mongodb'
import { readFile } from 'node:fs/promises'

process.env.DB_USER = 'test'
process.env.DB_PASS = 'test'
process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters'
process.env.ADMIN_PHONES = '01716285196'
const { createPublicContentRouter, createAdminContentRouter } = await import('../src/routes/content.routes.js')
const { blogSchema, dealerSchema, settingsSchema } = await import('../src/utils/contentSchemas.js')
const { seedSiteContent } = await import('../src/utils/seedSiteContent.js')
const seed = JSON.parse(await readFile(new URL('../src/data/siteSeed.json', import.meta.url), 'utf8'))

function memoryDb() {
  const data = new Map()
  const matches = (row, filter) => Object.entries(filter).every(([k, v]) => String(row[k]) === String(v))
  return { data, collection(name) {
    if (!data.has(name)) data.set(name, [])
    const rows = data.get(name)
    return {
      async createIndex() {},
      async findOne(filter) { return rows.find(r => matches(r, filter)) ?? null },
      find(filter) { let found = rows.filter(r => matches(r, filter)); return { sort() { return this }, project() { return this }, limit(n) { found = found.slice(0, n); return this }, async toArray() { return found } } },
      async insertOne(body) { if (body.slug && rows.some(r => r.slug === body.slug)) throw Object.assign(new Error('Duplicate'), { code: 11000 }); const row = { ...body, _id: body._id ?? new ObjectId() }; rows.push(row); return { insertedId: row._id } },
      async updateOne(filter, patch, options = {}) { const row = rows.find(r => matches(r, filter)); if (row) { Object.assign(row, patch.$set ?? {}); return { matchedCount: 1 } } if (options.upsert) rows.push({ ...filter, ...patch.$setOnInsert, ...patch.$set }); return { matchedCount: 0 } },
      async deleteOne(filter) { const index = rows.findIndex(r => matches(r, filter)); if (index < 0) return { deletedCount: 0 }; rows.splice(index, 1); return { deletedCount: 1 } },
    }
  } }
}

test('initial content migration is valid, complete, and never restores deleted content', async () => {
  assert.equal(seed.dealers.length, 37)
  for (const blog of seed.blogs) blogSchema.parse(blog)
  for (const dealer of seed.dealers) dealerSchema.parse(dealer)
  settingsSchema.parse(seed.settings)
  const db = memoryDb()
  await seedSiteContent(db)
  assert.equal(db.data.get('dealers').length, 37)
  db.data.get('dealers').splice(0)
  await seedSiteContent(db)
  assert.equal(db.data.get('dealers').length, 0)
})

test('content validation rejects unsafe URLs and strips injected security fields', () => {
  assert.equal(blogSchema.safeParse({ ...seed.blogs[0], coverImage: 'javascript:alert(1)' }).success, false)
  assert.equal(dealerSchema.safeParse({ ...seed.dealers[0], showroom: '' }).success, false)
  assert.equal('role' in dealerSchema.parse({ ...seed.dealers[0], role: 'admin' }), false)
})

test('content API publishes, edits, deletes and protects private operations', async t => {
  const db = memoryDb()
  await seedSiteContent(db)
  const app = express()
  app.use(express.json())
  const authorize = [(req, res, next) => {
    const role = req.get('x-test-role')
    if (!role) return res.status(401).json({ message: 'Sign in' })
    if (role !== 'admin') return res.status(403).json({ message: 'Admin only' })
    req.auth = { user: { phone: req.get('x-test-phone') ?? '01716285196' } }
    next()
  }]
  app.use('/public', createPublicContentRouter(() => db))
  app.use('/real-guards', createAdminContentRouter({ db: () => db }))
  app.use('/admin', createAdminContentRouter({ db: () => db, authorize, uploadImage: async () => ({ secureUrl: 'https://example.com/image.webp' }) }))
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const base = `http://127.0.0.1:${server.address().port}`
  const request = (path, method = 'GET', body, headers = { 'x-test-role': 'admin' }) => fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  assert.equal((await request('/real-guards/dealers')).status, 401)
  assert.equal((await request('/real-guards/dealers', 'GET', undefined, { authorization: 'Bearer invalid' })).status, 401)
  assert.equal((await request('/admin/dealers', 'GET', undefined, {})).status, 401)
  assert.equal((await request('/admin/dealers', 'GET', undefined, { 'x-test-role': 'user' })).status, 403)
  assert.equal((await request('/admin/dealers', 'POST', seed.dealers[0], { 'x-test-role': 'admin', origin: 'https://attacker.invalid' })).status, 403)
  const create = await request('/admin/dealers', 'POST', { ...seed.dealers[0], showroom: 'New showroom', published: false })
  assert.equal(create.status, 201)
  const { record } = await create.json()
  let publicDealers = (await (await request('/public/dealers')).json()).dealers
  assert.equal(publicDealers.length, 37)
  assert.equal((await request(`/admin/dealers/${record.id}`, 'PUT', { ...record, published: true })).status, 200)
  publicDealers = (await (await request('/public/dealers')).json()).dealers
  assert.equal(publicDealers.length, 38)
  assert.equal((await request(`/admin/dealers/${record.id}`, 'DELETE')).status, 200)
  assert.equal((await request(`/admin/dealers/${record.id}`, 'DELETE')).status, 404)
  assert.equal((await request('/admin/blogs', 'POST', seed.blogs[0])).status, 409)
  const post = { ...seed.blogs[0], slug: 'new-story', published: false }
  const created = await (await request('/admin/blogs', 'POST', post)).json()
  assert.equal((await request('/public/blogs/new-story')).status, 404)
  await request(`/admin/blogs/${created.record.id}`, 'PUT', { ...post, published: true })
  assert.equal((await request('/public/blogs/new-story')).status, 200)
  assert.equal((await request('/public/messages')).status, 404)
  assert.equal((await request('/public/messages', 'POST', { name: 'Rider', phone: '01800000000', email: 'rider@example.com', message: 'I would like to know about NEXO.', status: 'resolved' })).status, 201)
  const inbox = await (await request('/admin/messages')).json()
  assert.equal(inbox.messages[0].status, 'new')
  await request(`/admin/messages/${inbox.messages[0].id}`, 'PATCH', { status: 'resolved' })
  assert.equal(db.data.get('messages')[0].status, 'resolved')
  await request('/admin/settings', 'PUT', { ...seed.settings, phone: '01811111111', secret: 'not public' })
  const settings = await (await request('/public/settings')).json()
  assert.equal(settings.settings.phone, '01811111111')
  assert.equal('secret' in settings.settings, false)
  db.data.set('users', [{ _id: 'registered-user', name: 'Operator', phone: '01800000000', role: 'user', password: 'must-not-leak' }])
  const access = await (await request('/admin/admins')).json()
  assert.equal(JSON.stringify(access).includes('must-not-leak'), false)
  assert.equal((await request('/admin/admins', 'PUT', { phone: '01800000000', role: 'admin' }, { 'x-test-role': 'admin', 'x-test-phone': '01822222222' })).status, 403)
  assert.equal((await request('/admin/admins', 'PUT', { phone: '01716285196', role: 'user' })).status, 400)
  assert.equal((await request('/admin/admins', 'PUT', { phone: '01800000000', role: 'admin' })).status, 200)
  assert.equal(db.data.get('users')[0].role, 'admin')
  const supportedImage = new FormData()
  supportedImage.append('image', new Blob(['test image bytes'], { type: 'image/webp' }), 'cover.webp')
  const uploaded = await fetch(base + '/admin/uploads', { method: 'POST', headers: { 'x-test-role': 'admin' }, body: supportedImage })
  assert.equal(uploaded.status, 201)
  assert.equal((await uploaded.json()).url, 'https://example.com/image.webp')
  const unsupported = new FormData()
  unsupported.append('image', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'cover.svg')
  assert.equal((await fetch(base + '/admin/uploads', { method: 'POST', headers: { 'x-test-role': 'admin' }, body: unsupported })).status, 400)
  const oversize = new FormData()
  oversize.append('image', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/webp' }), 'large.webp')
  assert.equal((await fetch(base + '/admin/uploads', { method: 'POST', headers: { 'x-test-role': 'admin' }, body: oversize })).status, 413)
})
