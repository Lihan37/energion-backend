import { readFile } from 'node:fs/promises'

export async function seedSiteContent(db) {
  await db.collection('blogs').createIndex({ slug: 1 }, { unique: true })
  const migrations = db.collection('migrations')
  if (await migrations.findOne({ _id: 'site-content-v1' })) return
  const seed = JSON.parse(await readFile(new URL('../data/siteSeed.json', import.meta.url), 'utf8'))
  for (const resource of ['blogs', 'dealers']) {
    // Initial migration only: $setOnInsert never overwrites an admin's content.
    for (const [order, record] of seed[resource].entries()) {
      const { id, ...body } = record
      const filter = resource === 'blogs' ? { slug: body.slug } : { _id: id }
      await db.collection(resource).updateOne(filter, { $setOnInsert: { _id: id, ...body, published: true, order, createdAt: new Date().toISOString() } }, { upsert: true })
    }
  }
  await db.collection('settings').updateOne({ _id: 'site' }, { $setOnInsert: seed.settings }, { upsert: true })
  await migrations.updateOne({ _id: 'site-content-v1' }, { $setOnInsert: { completedAt: new Date().toISOString() } }, { upsert: true })
}
