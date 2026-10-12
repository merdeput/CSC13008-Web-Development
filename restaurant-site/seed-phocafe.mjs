/**
 * Pho digital-menu snapshot, researched 2026-10-12. Not a live crawler.
 * Names translated; descriptions paraphrased; ingredients only those stated
 * in the source (NOT complete recipes/allergen declarations). No images copied.
 * All demoPrice values are generated VND examples, NOT Pho prices/conversions.
 *
 * Copy to project root next to package.json. Requires the six-model schema
 * discussed (Category, Dish, Ingredient, DishIngredient, Chef, Reservation).
 * UUID/timestamp defaults must already exist; run project migrations first.
 * No chefs or reservations are invented by this seed.
 *
 * Preview (no DB connection): node seed-phocafe.mjs
 * Insert demo-priced dishes:
 *   node --env-file=.env seed-phocafe.mjs --apply --demo-prices
 * Insert reviewed prices: --apply --prices=prices.json
 * prices.json is an object mapping each printed slug to a whole-VND number.
 *
 * Prisma 7 / PostgreSQL driver adapter: add --adapter-pg, install the project's
 * compatible @prisma/adapter-pg and pg, and set DATABASE_URL.
 * Custom generated client: --client-module=./generated/prisma/client.js
 * Or --factory=./prisma-client.mjs exporting async createPrismaClient().
 * The factory can reuse your application's actual Prisma initialization.
 * Default client module: @prisma/client. Match your installed Prisma version.
 *
 * Re-runs skip existing Dish slugs and do not overwrite admin edits.
 * All writes are one transaction; no deletes/reset. Pass --activate to publish
 * this snapshot and unpublish only the known dishes from the prior Bep Hoi seed.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = 'https://videomenu.phocafe.co.uk/';
const groups = [
  { name: 'Khai vị', slug: 'khai-vi', source: root, dishes: [
    ['cha-gio', 'Chả giò', 'Crispy Spring Rolls', 55000, ['Xà lách', 'Rau thơm'], 'Cuốn chiên giòn, ăn cùng rau.'],
    ['goi-cuon', 'Gỏi cuốn', 'Summer Rolls', 50000, ['Bánh tráng', 'Bún', 'Đồ chua'], 'Cuốn tươi với bún và đồ chua.'],
    ['canh-ga', 'Cánh gà', 'Chicken Wings', 65000, ['Cánh gà', 'Sốt sriracha'], 'Cánh gà chiên kèm sốt cay.'],
    ['thit-vien-sa', 'Thịt viên sả', 'Pork & Lemongrass Meatballs', 65000, ['Thịt heo', 'Sả', 'Xà lách', 'Rau thơm'], 'Thịt viên dùng kèm rau.'],
    ['muc-chien', 'Mực chiên', 'Baby Squid', 75000, ['Mực', 'Muối', 'Tiêu', 'Chanh'], 'Mực chiên, chấm muối tiêu chanh.'],
    ['cha-gio-hai-san', 'Chả giò hải sản', 'Seafood Spring Roll', 75000, ['Tôm', 'Cua', 'Thịt heo', 'Nước chấm'], 'Cuốn hải sản chiên kèm nước chấm.'],
  ]},
  { name: 'Phở và món nước', slug: 'pho-mon-nuoc', source: root + 'category/pho-noodle-soups/', dishes: [
    ['pho-nam-bo', 'Phở nạm bò', 'Beef Brisket Phở', 75000, ['Nạm bò', 'Nước dùng xương bò'], 'Phở với nạm bò nấu mềm.'],
    ['pho-ga', 'Phở gà', 'Chicken Phở', 65000, ['Thịt gà', 'Nước dùng xương gà'], 'Phở gà với nước dùng xương.'],
    ['pho-rau-xanh', 'Phở rau xanh', 'Super Green', 65000, ['Rau muống', 'Đậu que', 'Cải thìa', 'Chanh', 'Húng quế Thái', 'Nước dùng rau'], 'Món nước với nhiều loại rau xanh.'],
    ['bun-cua', 'Bún cua', 'Crab Noodle Soup', 85000, ['Bún', 'Cà chua', 'Cua', 'Thịt bò', 'Đậu hũ'], 'Bún trong nước dùng cua và cà chua.'],
    ['pho-dac-biet', 'Phở đặc biệt', 'Pho House', 95000, ['Tôm', 'Thịt gà', 'Thịt bò', 'Tỏi', 'Nước dùng xương bò'], 'Phở kết hợp tôm, gà và bò.'],
  ]},
  { name: 'Gỏi', slug: 'goi', source: root + 'category/vietnamese-salads/', dishes: [
    ['goi-ga', 'Gỏi gà', 'Chicken Salad', 65000, ['Thịt gà', 'Rau thơm', 'Ớt chuông', 'Ớt', 'Gừng'], 'Gỏi gà với vị cay và gừng.'],
    ['goi-rau', 'Gỏi rau', 'Veggie Salad', 55000, ['Rau thơm', 'Ớt chuông', 'Ớt', 'Gừng'], 'Phiên bản gỏi không có thịt gà.'],
    ['goi-du-du', 'Gỏi đu đủ', 'Green Papaya Salad', 55000, ['Đu đủ xanh', 'Đậu phộng', 'Bánh phồng tôm'], 'Gỏi đu đủ xanh giòn.'],
    ['goi-xoai', 'Gỏi xoài', 'Mango Salad', 65000, ['Xoài xanh', 'Thịt heo', 'Tôm khô', 'Đậu phộng'], 'Gỏi xoài xanh với thịt và tôm khô.'],
    ['goi-buoi-tom', 'Gỏi bưởi tôm', 'Prawn & Pomelo Salad', 75000, ['Tôm', 'Bưởi', 'Ớt', 'Rau thơm', 'Dừa rang', 'Đậu phộng'], 'Gỏi bưởi tôm kèm dừa rang.'],
  ]},
  { name: 'Phở xào', slug: 'pho-xao', source: root + 'category/wok-fried-noodles/', dishes: [
    ['pho-xao-ga-tom', 'Phở xào gà tôm', 'Chicken & Prawn Noodles', 85000, ['Bánh phở', 'Thịt gà', 'Tôm', 'Sả', 'Ớt', 'Rau xanh', 'Đậu phộng'], 'Bánh phở xào với gà và tôm.'],
    ['pho-xao-bo', 'Phở xào bò', 'Beef Noodles', 85000, ['Bánh phở', 'Thịt bò', 'Sả', 'Ớt', 'Rau xanh', 'Đậu phộng'], 'Bánh phở xào thịt bò.'],
    ['pho-xao-dau-hu-nam', 'Phở xào đậu hũ nấm', 'Tofu & Mushroom Noodles', 75000, ['Bánh phở', 'Đậu hũ', 'Nấm', 'Sả', 'Ớt', 'Rau xanh', 'Đậu phộng'], 'Bánh phở xào đậu hũ và nấm.'],
  ]},
];

const rows = groups.flatMap((g, sortOrder) => g.dishes.map(
  ([slug, name, sourceName, demoPrice, ingredients, description]) => ({
    slug: 'phocafe-' + slug, name, sourceName, demoPrice, ingredients,
    description, category: g.name, categorySlug: g.slug, sortOrder, source: g.source,
  })));

const previousSeedSlugs = [
  'banh-xeo-mien-trung', 'bo-kho-banh-mi', 'bun-cha-ha-noi', 'bun-thit-nuong',
  'ca-phe-sua-da', 'cao-lau-hoi-an', 'cha-gio-tom-thit',
  'che-dau-xanh-nuoc-cot-dua', 'che-sen-long-nhan', 'com-tam-suon-nuong',
  'goi-cuon-tom-thit', 'mi-quang-ga', 'pho-bo-tai',
];
const featuredSlugs = new Set([
  'phocafe-pho-dac-biet', 'phocafe-pho-nam-bo', 'phocafe-cha-gio', 'phocafe-pho-ga',
]);

function value(args, key) {
  const arg = args.find(a => a.startsWith(key + '='));
  return arg ? arg.slice(key.length + 1) : undefined;
}
function moduleSpecifier(spec) {
  return spec.startsWith('.') || spec.startsWith('/') || /^[A-Za-z]:[\\/]/.test(spec)
    ? pathToFileURL(resolve(spec)).href : spec;
}

async function main() {
  const args = process.argv.slice(2);
  const allowed = ['--apply', '--demo-prices', '--adapter-pg', '--activate'];
  for (const a of args) {
    if (!allowed.includes(a) && !/^--(prices|client-module|factory)=.+$/.test(a)) {
      throw new Error('Unknown option: ' + a);
    }
  }
  if (args.includes('--demo-prices') && value(args, '--prices')) {
    throw new Error('Choose --demo-prices OR --prices, not both.');
  }
  if (args.includes('--activate') && !args.includes('--apply')) {
    throw new Error('--activate requires --apply.');
  }
  let prices;
  if (value(args, '--prices')) {
    prices = JSON.parse(await readFile(value(args, '--prices'), 'utf8'));
    if (!prices || typeof prices !== 'object' || Array.isArray(prices)) {
      throw new Error('Price file must contain an object mapping slugs to VND integers.');
    }
  }
  for (const r of rows) {
    r.price = prices ? prices[r.slug] : (args.includes('--demo-prices') ? r.demoPrice : null);
    if (r.price !== null && (!Number.isSafeInteger(r.price) || r.price < 0 || r.price > 999999999999)) {
      throw new Error('Missing/invalid whole-VND price for ' + r.slug);
    }
  }
  const outputRows = args.includes('--apply')
    ? rows.map(({ slug, name, category, price }) => ({ slug, name, category, price }))
    : rows;
  console.log(JSON.stringify({
    mode: args.includes('--apply') ? 'apply' : 'preview', snapshotDate: '2026-10-12',
    priceOrigin: prices ? 'user supplied' : (args.includes('--demo-prices') ? 'generated demo VND' : 'not supplied'),
    ingredientNotice: 'Only source-mentioned ingredients; incomplete recipe/allergen information.',
    categories: groups.length, dishes: rows.length,
    ingredients: new Set(rows.flatMap(r => r.ingredients)).size,
    rows: outputRows,
  }, null, 2));
  if (!args.includes('--apply')) return;
  if (rows.some(r => r.price === null)) {
    throw new Error('Supply --prices=prices.json or explicitly opt into --demo-prices. Nothing inserted.');
  }
  let prisma;
  try {
    const factory = value(args, '--factory');
    if (factory) {
      const mod = await import(moduleSpecifier(factory));
      if (typeof mod.createPrismaClient !== 'function') throw new Error('Factory must export createPrismaClient().');
      prisma = await mod.createPrismaClient();
    } else {
      const { PrismaClient } = await import(moduleSpecifier(value(args, '--client-module') || '@prisma/client'));
      if (args.includes('--adapter-pg')) {
        if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
        const { PrismaPg } = await import('@prisma/adapter-pg');
        prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
      } else prisma = new PrismaClient();
    }
    for (const m of ['category', 'dish', 'ingredient', 'dishIngredient']) {
      if (!prisma[m]) throw new Error('Missing Prisma model delegate: ' + m + '. Adapt to your schema before importing.');
    }
    const result = await prisma.$transaction(async tx => {
      let created = 0, skipped = 0, published = 0;
      for (const r of rows) {
        const existing = await tx.dish.findUnique({ where: { slug: r.slug }, select: { id: true, isPublished: true } });
        if (existing) {
          skipped++;
          if (args.includes('--activate')) {
            const data = {};
            if (!existing.isPublished) {
              data.isPublished = true;
              if (featuredSlugs.has(r.slug)) data.isFeatured = true;
            }
            if (Object.keys(data).length) await tx.dish.update({ where: { id: existing.id }, data });
            if (data.isPublished) published++;
          }
          continue;
        }
        const category = await tx.category.upsert({
          where: { slug: r.categorySlug }, update: {},
          create: { name: r.category, slug: r.categorySlug, sortOrder: r.sortOrder },
        });
        const dish = await tx.dish.create({ data: {
          name: r.name, slug: r.slug, description: r.description,
          price: String(r.price), categoryId: category.id, imageUrl: null,
          isPublished: args.includes('--activate'), isAvailable: true,
          isFeatured: args.includes('--activate') && featuredSlugs.has(r.slug),
        }});
        for (const name of r.ingredients) {
          const ingredient = await tx.ingredient.upsert({ where: { name }, update: {}, create: { name } });
          await tx.dishIngredient.create({ data: { dishId: dish.id, ingredientId: ingredient.id } });
        }
        created++;
        if (args.includes('--activate')) published++;
      }
      let previousMenuUnpublished = 0;
      if (args.includes('--activate')) {
        const result = await tx.dish.updateMany({
          where: { slug: { in: previousSeedSlugs }, isPublished: true },
          data: { isPublished: false },
        });
        previousMenuUnpublished = result.count;
      }
      return { created, skipped, published, previousMenuUnpublished };
    }, { maxWait: 10000, timeout: 120000 });
    console.log('Committed:', result, args.includes('--activate')
      ? 'Pho Cafe snapshot is public; review its example prices in /admin/dishes.'
      : 'New dishes remain unpublished until reviewed in /admin/dishes.');
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Never print connection strings. Retain only non-secret Prisma diagnostics.
  const diagnostic = {
    name: error?.name,
    code: error?.code,
    model: error?.meta?.modelName,
    databaseCode: error?.meta?.code,
  };
  console.error('Import failed. No partial transaction is committed.', JSON.stringify(diagnostic));
  process.exitCode = 1;
});
