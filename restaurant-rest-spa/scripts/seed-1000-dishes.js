require('dotenv').config();

const { Prisma, PrismaClient } = require('@prisma/client');
const { createPrismaAdapter } = require('../server/src/lib/postgres-adapter');
const { slugify } = require('../server/src/lib/slug');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to seed Supabase PostgreSQL.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: createPrismaAdapter(process.env.DIRECT_URL || process.env.DATABASE_URL)
});

const targetPerCategory = 200;
const categorySeeds = [
  {
    slug: 'mon-khai-vi', label: 'món khai vị',
    bases: ['Gỏi cuốn', 'Chả giò', 'Gỏi bưởi', 'Nộm đu đủ', 'Bánh xèo mini', 'Nem nướng cuốn', 'Hoành thánh chiên', 'Gỏi xoài xanh', 'Đậu hũ chiên', 'Bánh tráng cuốn'],
    variants: ['tôm thịt', 'tôm đất', 'thịt nướng', 'nấm và đậu hũ', 'cá nướng', 'gà xé', 'rau theo mùa', 'sả tỏi', 'mè rang', 'đậu phộng', 'chua ngọt', 'kiểu miền Trung', 'sốt mắm gừng', 'sốt đậu phộng', 'rau thơm', 'tôm khô', 'lá chuối', 'cà rốt bắp cải', 'nước chấm nhà làm', 'hành phi'],
    ingredients: ['Tôm', 'Thịt heo', 'Bánh tráng', 'Rau sống', 'Nước mắm', 'Chanh', 'Đậu phộng', 'Tỏi', 'Rau thơm', 'Xoài xanh'],
    images: [
      'https://images.unsplash.com/photo-1594020293008-5f99f60bd4d7?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1577859584099-38d38a4aacb5?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=1200&q=85'
    ],
    priceBase: 48000, priceSpan: 38000,
    description: 'Món khai vị được chuẩn bị tại bếp, dùng cùng rau thơm tươi và nước chấm pha vừa vị.'
  },
  {
    slug: 'mon-nuoc', label: 'món nước',
    bases: ['Phở', 'Bún', 'Mì Quảng', 'Cao lầu', 'Hủ tiếu', 'Bánh canh', 'Miến', 'Cháo', 'Mì nước', 'Bún riêu'],
    variants: ['bò tái', 'nạm bò', 'gà ta', 'tôm tươi', 'cá lóc', 'sườn non', 'hải sản', 'thịt xá xíu', 'gà xé', 'chả cá', 'mực tươi', 'tôm khô', 'đậu hũ và nấm', 'rau củ', 'thịt heo quay', 'bò hầm', 'cá hấp', 'thịt nướng', 'cua và tôm', 'gà nướng'],
    ingredients: ['Thịt bò', 'Xương bò', 'Bánh phở', 'Bún tươi', 'Thịt gà', 'Tôm', 'Nước dùng xương bò', 'Nước dùng xương gà', 'Gừng', 'Quế hồi', 'Hành phi', 'Rau thơm'],
    images: [
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1766050586763-723571af4dde?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1631709497146-a239ef373cf1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1597345637412-9fd611e758f3?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?auto=format&fit=crop&w=1200&q=85'
    ],
    priceBase: 65000, priceSpan: 65000,
    description: 'Nước dùng ninh chậm theo phong vị miền Trung, hoàn thiện cùng rau thơm trước khi mang ra.'
  },
  {
    slug: 'mon-chinh', label: 'món chính',
    bases: ['Cơm niêu', 'Cơm tấm', 'Cơm gà', 'Cá kho', 'Gà nướng', 'Bò xào', 'Tôm rim', 'Thịt kho', 'Đậu hũ kho', 'Bánh xèo', 'Bún chả', 'Mì xào', 'Rau củ xào', 'Sườn nướng', 'Vịt quay', 'Mực xào', 'Lẩu', 'Cá hấp', 'Heo quay', 'Cà tím nướng'],
    variants: ['sả mật ong', 'tiêu xanh', 'tỏi ớt', 'nước mắm gừng', 'lá chuối', 'rau theo mùa', 'sốt me', 'đậu phộng rang', 'nấm rơm', 'gừng hành'],
    ingredients: ['Thịt heo', 'Thịt gà', 'Thịt bò', 'Gạo tấm', 'Thịt nướng', 'Tôm', 'Mực', 'Đậu hũ', 'Ớt', 'Sả', 'Tỏi', 'Tiêu'],
    images: [
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1597311280719-b6bb2ca37f62?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1641440615059-42c8ed3af8c8?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1775148582534-44e3700ed081?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=1200&q=85'
    ],
    priceBase: 78000, priceSpan: 90000,
    description: 'Món chính được chế biến theo mẻ nhỏ, nêm vừa vị và dùng nóng cùng rau theo mùa.'
  },
  {
    slug: 'mon-ngot', label: 'món ngọt',
    bases: ['Chè', 'Bánh flan', 'Rau câu', 'Sữa chua', 'Xôi ngọt', 'Bánh nếp', 'Bánh da lợn', 'Tàu hũ', 'Bánh chuối', 'Chè sen'],
    variants: ['hạt sen', 'đậu xanh', 'nước cốt dừa', 'long nhãn', 'khoai môn', 'mè đen', 'dừa tươi', 'gừng mật', 'trái cây theo mùa', 'lá dứa', 'đậu đỏ', 'thạch rau câu', 'chuối nướng', 'nếp cẩm', 'sốt gừng', 'thơm tươi', 'đậu phộng rang', 'hạnh nhân', 'mứt gừng', 'ca cao'],
    ingredients: ['Hạt sen', 'Đậu xanh', 'Nước cốt dừa', 'Dừa tươi', 'Dừa rang', 'Đậu phộng', 'Trứng gà', 'Muối', 'Bưởi', 'Xoài xanh'],
    images: [
      'https://images.unsplash.com/photo-1527242263-03150c939169?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1773394846666-4b31785e86a2?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=1200&q=85'
    ],
    priceBase: 32000, priceSpan: 38000,
    description: 'Món tráng miệng có vị ngọt thanh, dùng lạnh hoặc ấm tùy món để khép lại bữa ăn.'
  },
  {
    slug: 'thuc-uong', label: 'thức uống',
    bases: ['Trà', 'Nước ép', 'Sinh tố', 'Cà phê', 'Sữa hạt', 'Nước mát', 'Trà trái cây', 'Soda', 'Nước chanh', 'Nước dừa'],
    variants: ['chanh sả', 'gừng mật ong', 'xoài chín', 'dâu tươi', 'tắc mật ong', 'bạc hà', 'dừa non', 'cam tươi', 'cốt dừa', 'thanh long', 'gạo rang', 'lá dứa', 'táo xanh', 'ổi hồng', 'dứa thơm', 'đậu nành', 'hoa nhài', 'atisô', 'quế hồi', 'đá xay'],
    ingredients: ['Cà phê', 'Sữa đặc', 'Chanh', 'Dừa tươi', 'Xoài xanh', 'Bưởi', 'Gừng', 'Sả', 'Húng quế Thái', 'Muối', 'Nước cốt dừa'],
    images: [
      'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1664515725366-e8328e9dc834?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1760769214612-aff51cd270bd?auto=format&fit=crop&w=1200&q=85'
    ],
    priceBase: 26000, priceSpan: 36000,
    description: 'Thức uống pha tại bếp từ trái cây, cà phê hoặc thảo mộc, cân bằng vị ngọt và hương thơm.'
  }
];

const curatedDishNames = new Set([
  'Cao lầu Hội An', 'Phở bò tái', 'Mì Quảng gà', 'Bún chả Hà Nội', 'Gỏi cuốn tôm thịt',
  'Chả giò tôm thịt', 'Cơm tấm sườn nướng', 'Bánh xèo miền Trung', 'Bò kho bánh mì',
  'Bún thịt nướng', 'Chè sen long nhãn', 'Cà phê sữa đá', 'Chè đậu xanh nước cốt dừa'
]);

function generateSeedRows(categories, ingredients) {
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const ingredientByName = new Map(ingredients.map((ingredient) => [ingredient.name, ingredient]));
  const rows = [];

  for (const definition of categorySeeds) {
    const category = categoryBySlug.get(definition.slug);
    if (!category) throw new Error(`Required category not found: ${definition.slug}`);

    const availableIngredients = definition.ingredients
      .map((name) => ingredientByName.get(name))
      .filter(Boolean);
    if (availableIngredients.length < 3) throw new Error(`Not enough existing ingredients for ${definition.slug}.`);

    for (let index = 0; index < targetPerCategory; index += 1) {
      const base = definition.bases[index % definition.bases.length];
      const variant = definition.variants[Math.floor(index / definition.bases.length)];
      const baseName = `${base} ${variant}`;
      const name = curatedDishNames.has(baseName) ? `${baseName} nhà làm` : baseName;
      const slug = slugify(name);
      const linkedIngredients = [0, 1, 2].map((offset) =>
        availableIngredients[(index * 3 + offset * 4) % availableIngredients.length]
      );
      const uniqueIngredients = [...new Map(linkedIngredients.map((item) => [item.id, item])).values()];

      rows.push({
        slug,
        dish: {
          categoryId: category.id,
          name,
          slug,
          description: `${definition.description} Thành phần chính: ${uniqueIngredients.map(({ name: ingredientName }) => ingredientName.toLocaleLowerCase('vi-VN')).join(', ')}.`,
          price: definition.priceBase + ((index * 977) % definition.priceSpan),
          imageUrl: definition.images[index % definition.images.length],
          isPublished: true,
          isAvailable: false,
          isFeatured: false
        },
        ingredientIds: uniqueIngredients.map(({ id }) => id)
      });
    }
  }

  if (rows.length !== 1000) throw new Error(`Expected 1000 generated dishes; generated ${rows.length}.`);
  if (new Set(rows.map(({ slug }) => slug)).size !== rows.length) throw new Error('Generated dish slugs are not unique.');
  if (rows.some(({ dish }) => dish.name.length > 120 || dish.description.length > 2400 || !dish.imageUrl)) {
    throw new Error('Generated dish data exceeds schema limits or is missing a photo.');
  }

  return rows;
}

async function updateLegacyDishes(transaction, updates) {
  if (!updates.length) return;
  const values = updates.map(({ id, data }) => Prisma.sql`(
    ${id}::uuid, ${data.name}, ${data.slug}, ${data.description}, ${data.imageUrl}
  )`);
  await transaction.$executeRaw(Prisma.sql`
    UPDATE "Dish" AS dish
    SET "name" = changes.name,
        "slug" = changes.slug,
        "description" = changes.description,
        "imageUrl" = changes.image_url
    FROM (VALUES ${Prisma.join(values)}) AS changes(id, name, slug, description, image_url)
    WHERE dish.id = changes.id
  `);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const cleanPlaceholdersOnly = process.argv.includes('--clean-placeholders-only');
  const apply = process.argv.includes('--apply');
  if (cleanPlaceholdersOnly && !dryRun && !apply) {
    throw new Error('Use --apply to update existing placeholder dishes.');
  }
  const result = await prisma.$transaction(async (transaction) => {
    const [categories, ingredients] = await Promise.all([
      transaction.category.findMany({ where: { slug: { in: categorySeeds.map(({ slug }) => slug) } } }),
      transaction.ingredient.findMany({ select: { id: true, name: true } })
    ]);

    const rows = generateSeedRows(categories, ingredients);
    const slugs = rows.map(({ slug }) => slug);
    const [currentRows, legacyRows] = await Promise.all([
      transaction.dish.findMany({
        where: { slug: { in: slugs } },
        select: { id: true, slug: true, name: true, categoryId: true, description: true, imageUrl: true, isPublished: true, isAvailable: true, isFeatured: true }
      }),
      transaction.dish.findMany({
        where: { name: { startsWith: 'Món mẫu ' }, categoryId: { in: categories.map(({ id }) => id) } },
        select: { id: true, name: true, categoryId: true }
      })
    ]);

    const rowBySlug = new Map(rows.map((row) => [row.slug, row]));
    const currentBySlug = new Map(currentRows.map((row) => [row.slug, row]));
    for (const existing of currentRows) {
      const expected = rowBySlug.get(existing.slug);
      const isGeneratedRow = existing.name === expected.dish.name
        && existing.categoryId === expected.dish.categoryId
        && existing.description === expected.dish.description
        && existing.imageUrl === expected.dish.imageUrl
        && existing.isPublished && !existing.isAvailable && !existing.isFeatured;
      if (!isGeneratedRow) throw new Error(`A different dish already uses the generated name “${expected.dish.name}”. No rows were changed.`);
    }

    const legacyUpdates = [];
    for (const legacy of legacyRows) {
      const match = legacy.name.match(/^Món mẫu (\d{4}) — /);
      const expected = match ? rows[Number(match[1]) - 1] : null;
      if (!expected || expected.dish.categoryId !== legacy.categoryId) {
        throw new Error(`A placeholder dish did not match its original category and order (“${legacy.name}”). No rows were changed.`);
      }
      if (currentBySlug.has(expected.slug)) {
        throw new Error(`Both a placeholder and a renamed dish exist for “${expected.dish.name}”. No rows were changed.`);
      }
      legacyUpdates.push({ id: legacy.id, data: { name: expected.dish.name, slug: expected.dish.slug, description: expected.dish.description, imageUrl: expected.dish.imageUrl } });
    }

    const legacySlugs = new Set(legacyUpdates.map(({ data }) => data.slug));
    const existingCount = currentRows.length + legacyUpdates.length;
    const missingRows = rows.filter(({ slug }) => !currentBySlug.has(slug) && !legacySlugs.has(slug));

    if (dryRun) {
      return {
        generated: rows.length, existing: existingCount, placeholdersToUpdate: legacyUpdates.length,
        wouldCreate: cleanPlaceholdersOnly ? 0 : missingRows.length, created: 0
      };
    }

    await updateLegacyDishes(transaction, legacyUpdates);
    if (cleanPlaceholdersOnly) return { generated: rows.length, existing: existingCount, placeholdersUpdated: legacyUpdates.length, created: 0 };

    if (missingRows.length) {
      await transaction.dish.createMany({ data: missingRows.map(({ dish }) => dish) });
    }

    const savedDishes = await transaction.dish.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true }
    });
    const idBySlug = new Map(savedDishes.map(({ id, slug }) => [slug, id]));
    const links = rows.flatMap(({ slug, ingredientIds }) => {
      const dishId = idBySlug.get(slug);
      return dishId ? ingredientIds.map((ingredientId) => ({ dishId, ingredientId })) : [];
    });
    if (links.length) await transaction.dishIngredient.createMany({ data: links, skipDuplicates: true });

    const savedCount = await transaction.dish.count({ where: { slug: { in: slugs } } });
    await transaction.dish.updateMany({
      where: { slug: { in: slugs }, OR: [{ isPublished: false }, { isAvailable: true }, { isFeatured: true }] },
      data: { isPublished: true, isAvailable: false, isFeatured: false }
    });
    const verified = await transaction.dish.findMany({
      where: { slug: { in: slugs } },
      select: { isPublished: true, isAvailable: true, imageUrl: true, description: true, ingredients: { select: { ingredientId: true } } }
    });
    const complete = verified.length === rows.length && verified.every((dish) =>
      dish.isPublished && !dish.isAvailable && dish.imageUrl && dish.description && dish.ingredients.length >= 3
    );
    if (savedCount !== rows.length || !complete) throw new Error(`Verification failed for generated dishes (${verified.length}/1000).`);

    return {
      generated: rows.length, existing: existingCount, placeholdersUpdated: legacyUpdates.length,
      wouldCreate: missingRows.length, created: missingRows.length
    };
  }, { maxWait: 15000, timeout: 120000 });

  console.log(JSON.stringify({
    ...result,
    isPublished: true,
    isAvailable: false,
    note: 'isAvailable=false is the existing schema/API field for “Đang phục vụ” unchecked.'
  }, null, 2));
}

main()
  .catch((error) => {
    const detail = error.message || [error.name, error.code || error.cause?.code].filter(Boolean).join(' (') + (error.code || error.cause?.code ? ')' : '');
    console.error('Dish seed failed:', detail || 'Unknown database or seed error.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
