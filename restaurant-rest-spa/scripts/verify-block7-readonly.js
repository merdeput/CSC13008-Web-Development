require('dotenv').config();

const { createApp } = require('../server/src/app');
const { getPrisma, disconnectPrisma } = require('../server/src/lib/prisma');

async function main() {
  const db = getPrisma();
  const counts = {
    all: await db.dish.count(),
    published: await db.dish.count({ where: { isPublished: true } }),
    zeroPrice: await db.dish.count({ where: { price: 0 } }),
    availableTrue: await db.dish.count({ where: { isAvailable: true } }),
    availableFalse: await db.dish.count({ where: { isAvailable: false } })
  };
  const duplicatePrices = await db.$queryRaw`
    SELECT COUNT(*) AS groups FROM (
      SELECT "price" FROM "Dish" GROUP BY "price" HAVING COUNT(*) > 1
    ) AS repeated
  `;
  counts.duplicatePriceGroups = Number(duplicatePrices[0]?.groups || 0);

  const server = createApp().listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function getMenu(query) {
      const response = await fetch(`${base}/api/menu?${new URLSearchParams(query)}`);
      return { status: response.status, body: await response.json() };
    }

    const samples = [
      { mode: 'basic', q: 'Phở' },
      { mode: 'advanced', q: '', minPrice: '0', available: 'false' },
      { mode: 'fulltext', q: 'Phở' },
      { mode: 'fuzzy', q: 'Phở' }
    ];
    const searches = [];
    for (const sample of samples) {
      const first = await getMenu({ ...sample, page: '1', pageSize: '2' });
      const second = await getMenu({ ...sample, page: '2', pageSize: '2' });
      if (!first.body.ok || !second.body.ok) throw new Error(`${sample.mode} menu request failed`);
      const firstIds = new Set(first.body.data.items.map((dish) => dish.id));
      searches.push({
        mode: sample.mode,
        query: sample.q,
        status: first.status,
        total: first.body.data.total,
        pageCount: first.body.data.pageCount,
        firstPageNames: first.body.data.items.map((dish) => dish.name),
        pagesOverlap: second.body.data.items.some((dish) => firstIds.has(dish.id))
      });
    }

    const zeroPrice = await getMenu({ mode: 'advanced', minPrice: '0', maxPrice: '0', available: 'false' });
    const lowerBasic = await getMenu({ mode: 'basic', q: 'phở', pageSize: '2' });
    const adminResponse = await fetch(`${base}/api/admin/dishes?minPrice=0&maxPrice=0&isAvailable=false&sortBy=price&sortDirection=asc`);
    const adminZeroPrice = await adminResponse.json();
    const noMatch = await getMenu({ mode: 'basic', q: '__no_such_dish__' });
    const literal = await getMenu({ mode: 'basic', q: '%_!' });
    const invalid = await Promise.all([
      getMenu({ mode: 'fulltext', q: '' }),
      getMenu({ mode: 'fuzzy', q: '' }),
      getMenu({ mode: 'advanced', minPrice: 'abc' }),
      getMenu({ mode: 'advanced', available: 'maybe' }),
      getMenu({ mode: 'advanced', minPrice: '2', maxPrice: '1' })
    ]);
    const databaseHost = new URL(process.env.DATABASE_URL).hostname;
    const evidence = {
      configuredSupabaseHost: databaseHost.endsWith('.supabase.com'),
      counts,
      searches,
      basicCaseInsensitive: lowerBasic.body.data?.total === searches[0].total,
      zeroPriceFilter: { total: zeroPrice.body.data?.total, firstPrice: zeroPrice.body.data?.items[0]?.price },
      adminZeroPriceFilter: { total: adminZeroPrice.data?.total, firstPrice: adminZeroPrice.data?.items[0]?.price },
      noMatch: { total: noMatch.body.data?.total, items: noMatch.body.data?.items.length },
      literalQuery: { total: literal.body.data?.total, items: literal.body.data?.items.length },
      invalidCodes: invalid.map(({ body }) => body.error?.code)
    };
    if (!evidence.configuredSupabaseHost || counts.published < 1000 || counts.zeroPrice < 1 ||
        counts.availableTrue < 1 || counts.availableFalse < 1 || counts.duplicatePriceGroups < 1 ||
        searches.some((search) => search.status !== 200 || search.pagesOverlap) || !evidence.basicCaseInsensitive ||
        Number(evidence.zeroPriceFilter.firstPrice) !== 0 || Number(evidence.adminZeroPriceFilter.firstPrice) !== 0 ||
        evidence.noMatch.total !== 0 || evidence.literalQuery.total !== 0 ||
        evidence.invalidCodes.some((code) => code !== 'VALIDATION_FAILED')) {
      throw new Error('One or more Block 7 evidence checks did not match the expected result.');
    }
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main()
  .catch((error) => {
    console.error('Block 7 read-only verification failed:', error.name, error.code || '', error.message);
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
