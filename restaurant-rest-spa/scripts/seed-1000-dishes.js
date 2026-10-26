require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
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
    fallbackImages: [
      'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=1200&q=85'
    ],
    priceBase: 48000, priceSpan: 38000,
    description: 'Được chuẩn bị theo phong cách bếp nhà, kết hợp nguyên liệu tươi và nước chấm pha tại bếp.'
  },
  {
    slug: 'mon-nuoc', label: 'món nước',
    bases: ['Phở', 'Bún', 'Mì Quảng', 'Cao lầu', 'Hủ tiếu', 'Bánh canh', 'Miến', 'Cháo', 'Mì nước', 'Bún riêu'],
    variants: ['bò tái', 'nạm bò', 'gà ta', 'tôm tươi', 'cá lóc', 'sườn non', 'hải sản', 'thịt xá xíu', 'gà xé', 'chả cá', 'mực tươi', 'tôm khô', 'đậu hũ và nấm', 'rau củ', 'thịt heo quay', 'bò hầm', 'cá hấp', 'thịt nướng', 'cua và tôm', 'gà nướng'],
    ingredients: ['Thịt bò', 'Xương bò', 'Bánh phở', 'Bún tươi', 'Thịt gà', 'Tôm', 'Nước dùng xương bò', 'Nước dùng xương gà', 'Gừng', 'Quế hồi', 'Hành phi', 'Rau thơm'],
    fallbackImages: [
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1569058242567-93de6f36f22e?auto=format&fit=crop&w=1200&q=85'
    ],
    priceBase: 65000, priceSpan: 65000,
    description: 'Nước dùng được nêm theo phong vị Việt, ăn kèm rau thơm và phần nguyên liệu chính đã chọn.'
  },
  {
    slug: 'mon-chinh', label: 'món chính',
    bases: ['Cơm niêu', 'Cơm tấm', 'Cơm gà', 'Cá kho', 'Gà nướng', 'Bò xào', 'Tôm rim', 'Thịt kho', 'Đậu hũ kho', 'Bánh xèo', 'Bún chả', 'Mì xào', 'Rau củ xào', 'Sườn nướng', 'Vịt quay', 'Mực xào', 'Lẩu', 'Cá hấp', 'Heo quay', 'Cà tím nướng'],
    variants: ['sả mật ong', 'tiêu xanh', 'tỏi ớt', 'nước mắm gừng', 'lá chuối', 'rau theo mùa', 'sốt me', 'đậu phộng rang', 'nấm rơm', 'gừng hành'],
    ingredients: ['Thịt heo', 'Thịt gà', 'Thịt bò', 'Gạo tấm', 'Thịt nướng', 'Tôm', 'Mực', 'Đậu hũ', 'Ớt', 'Sả', 'Tỏi', 'Tiêu'],
    fallbackImages: [
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1569058242567-93de6f36f22e?auto=format&fit=crop&w=1200&q=85'
    ],
    priceBase: 78000, priceSpan: 90000,
    description: 'Món ăn được chế biến theo mẻ nhỏ, nêm vừa vị và dùng cùng cơm hoặc rau theo mùa.'
  },
  {
    slug: 'mon-ngot', label: 'món ngọt',
    bases: ['Chè', 'Bánh flan', 'Rau câu', 'Sữa chua', 'Xôi ngọt', 'Bánh nếp', 'Bánh da lợn', 'Tàu hũ', 'Bánh chuối', 'Chè sen'],
    variants: ['hạt sen', 'đậu xanh', 'nước cốt dừa', 'long nhãn', 'khoai môn', 'mè đen', 'dừa tươi', 'gừng mật', 'trái cây theo mùa', 'lá dứa', 'đậu đỏ', 'thạch rau câu', 'chuối nướng', 'nếp cẩm', 'sốt gừng', 'thơm tươi', 'đậu phộng rang', 'hạnh nhân', 'mứt gừng', 'ca cao'],
    ingredients: ['Hạt sen', 'Đậu xanh', 'Nước cốt dừa', 'Dừa tươi', 'Dừa rang', 'Đậu phộng', 'Trứng gà', 'Muối', 'Bưởi', 'Xoài xanh'],
    fallbackImages: [
      'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=1200&q=85'
    ],
    priceBase: 32000, priceSpan: 38000,
    description: 'Món tráng miệng có vị ngọt thanh, dùng nguyên liệu theo mùa và hoàn thiện tại bếp.'
  },
  {
    slug: 'thuc-uong', label: 'thức uống',
    bases: ['Trà', 'Nước ép', 'Sinh tố', 'Cà phê', 'Sữa hạt', 'Nước mát', 'Trà trái cây', 'Soda', 'Nước chanh', 'Nước dừa'],
    variants: ['chanh sả', 'gừng mật ong', 'xoài chín', 'dâu tươi', 'tắc mật ong', 'bạc hà', 'dừa non', 'cam tươi', 'cốt dừa', 'thanh long', 'gạo rang', 'lá dứa', 'táo xanh', 'ổi hồng', 'dứa thơm', 'đậu nành', 'hoa nhài', 'atisô', 'quế hồi', 'đá xay'],
    ingredients: ['Cà phê', 'Sữa đặc', 'Chanh', 'Dừa tươi', 'Xoài xanh', 'Bưởi', 'Gừng', 'Sả', 'Húng quế Thái', 'Muối', 'Nước cốt dừa'],
    fallbackImages: [
      'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=1200&q=85'
    ],
    priceBase: 26000, priceSpan: 36000,
    description: 'Thức uống được pha tại bếp, cân bằng vị ngọt và hương thơm của trái cây hoặc thảo mộc.'
  }
];

function generateSeedRows(categories, ingredients, imagesByCategory) {
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

    const imagePool = [...new Set([...(imagesByCategory.get(definition.slug) || []), ...definition.fallbackImages])];
    for (let index = 0; index < targetPerCategory; index += 1) {
      const base = definition.bases[index % definition.bases.length];
      const variant = definition.variants[Math.floor(index / definition.bases.length)];
      const serial = String(rows.length + 1).padStart(4, '0');
      const name = `Món mẫu ${serial} — ${base} ${variant}`;
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
          description: `${definition.description} Nguyên liệu tham khảo: ${uniqueIngredients.map(({ name: ingredientName }) => ingredientName).join(', ')}. Đây là dữ liệu mẫu để kiểm thử thực đơn và phân trang.`,
          price: definition.priceBase + ((index * 977) % definition.priceSpan),
          imageUrl: imagePool[index % imagePool.length],
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

async function main() {
  const result = await prisma.$transaction(async (transaction) => {
    const [categories, ingredients, existingImageRows] = await Promise.all([
      transaction.category.findMany({ where: { slug: { in: categorySeeds.map(({ slug }) => slug) } } }),
      transaction.ingredient.findMany({ select: { id: true, name: true } }),
      transaction.dish.findMany({
        where: { imageUrl: { not: null } },
        select: { imageUrl: true, category: { select: { slug: true } } },
        orderBy: { name: 'asc' }
      })
    ]);

    const imagesByCategory = new Map();
    for (const row of existingImageRows) {
      const categorySlug = row.category.slug;
      const pool = imagesByCategory.get(categorySlug) || [];
      pool.push(row.imageUrl);
      imagesByCategory.set(categorySlug, pool);
    }

    const rows = generateSeedRows(categories, ingredients, imagesByCategory);
    const slugs = rows.map(({ slug }) => slug);
    const currentRows = await transaction.dish.findMany({ where: { slug: { in: slugs } }, select: { slug: true } });
    const currentSlugs = new Set(currentRows.map(({ slug }) => slug));
    const missingRows = rows.filter(({ slug }) => !currentSlugs.has(slug));

    if (process.argv.includes('--dry-run')) {
      return { generated: rows.length, existing: currentRows.length, wouldCreate: missingRows.length, created: 0 };
    }

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

    return { generated: rows.length, existing: currentRows.length, wouldCreate: missingRows.length, created: missingRows.length };
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
    console.error('Dish seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
