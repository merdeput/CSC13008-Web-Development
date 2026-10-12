require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { slugify } = require('../src/lib/slug');
const { createPrismaAdapter } = require('../src/lib/postgres-adapter');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to seed Supabase PostgreSQL.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: createPrismaAdapter(process.env.DATABASE_URL)
});

const categories = [
  { name: 'Món khai vị', slug: 'mon-khai-vi', sortOrder: 1 },
  { name: 'Món nước', slug: 'mon-nuoc', sortOrder: 2 },
  { name: 'Món chính', slug: 'mon-chinh', sortOrder: 3 },
  { name: 'Món ngọt', slug: 'mon-ngot', sortOrder: 4 },
  { name: 'Thức uống', slug: 'thuc-uong', sortOrder: 5 }
];

const ingredientNames = [
  'Bánh phở', 'Thịt bò', 'Xương bò', 'Hành tím', 'Gừng', 'Quế hồi', 'Rau thơm', 'Bánh tráng',
  'Tôm', 'Thịt heo', 'Bánh cao lầu', 'Thịt gà', 'Đậu phộng', 'Nước mắm', 'Chanh', 'Ớt',
  'Bún tươi', 'Thịt nướng', 'Gạo tấm', 'Trứng gà', 'Dừa tươi', 'Hạt sen', 'Đậu xanh', 'Cà phê',
  'Sữa đặc', 'Rau sống', 'Bột nghệ', 'Hành phi', 'Bánh mì', 'Cà rốt', 'Sả', 'Nước cốt dừa'
];

const dishes = [
  {
    name: 'Cao lầu Hội An', category: 'Món nước', price: '89000', featured: true,
    description: 'Sợi cao lầu dai thơm, thịt xá xíu ướp ngũ vị, rau Trà Quế và bánh tráng giòn. Trộn cùng chút nước dùng ninh chậm.',
    imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=85',
    ingredients: ['Bánh cao lầu', 'Thịt heo', 'Rau thơm', 'Đậu phộng', 'Nước mắm']
  },
  {
    name: 'Phở bò tái', category: 'Món nước', price: '95000', featured: true,
    description: 'Nước dùng trong được ninh từ xương bò, thơm nhẹ quế hồi, đi cùng bánh phở mềm và thịt bò tái thái mỏng.',
    imageUrl: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=1200&q=85',
    ingredients: ['Bánh phở', 'Thịt bò', 'Xương bò', 'Gừng', 'Quế hồi', 'Rau thơm']
  },
  {
    name: 'Mì Quảng gà', category: 'Món nước', price: '82000', featured: true,
    description: 'Mì vàng nghệ, gà ta rim đậm vị, nước nhân vừa đủ, ăn cùng bánh tráng mè, đậu phộng và rau sống.',
    imageUrl: 'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?auto=format&fit=crop&w=1200&q=85',
    ingredients: ['Thịt gà', 'Bột nghệ', 'Đậu phộng', 'Rau sống', 'Hành phi']
  },
  {
    name: 'Bún chả Hà Nội', category: 'Món chính', price: '99000', featured: true,
    description: 'Thịt ba chỉ và chả viên nướng than, bún tươi, rau thơm và bát nước mắm chua ngọt pha tại bếp.',
    imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=85',
    ingredients: ['Bún tươi', 'Thịt nướng', 'Nước mắm', 'Chanh', 'Rau thơm']
  },
  {
    name: 'Gỏi cuốn tôm thịt', category: 'Món khai vị', price: '68000', featured: false,
    description: 'Hai cuốn bánh tráng mỏng ôm tôm, thịt, bún và rau xanh; dùng với tương đậu phộng nhà làm.',
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85',
    ingredients: ['Bánh tráng', 'Tôm', 'Thịt heo', 'Rau sống', 'Đậu phộng']
  },
  {
    name: 'Chả giò tôm thịt', category: 'Món khai vị', price: '72000', featured: false,
    description: 'Chả giò cuốn tay, nhân tôm thịt và rau củ, chiên vàng giòn. Dùng kèm rau sống và nước chấm.',
    imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=1200&q=85',
    ingredients: ['Bánh tráng', 'Tôm', 'Thịt heo', 'Cà rốt', 'Nước mắm']
  },
  {
    name: 'Cơm tấm sườn nướng', category: 'Món chính', price: '89000', featured: false,
    description: 'Cơm tấm dẻo thơm, sườn nướng sả mật ong, trứng ốp la và đồ chua giòn nhẹ.',
    imageUrl: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1200&q=85',
    ingredients: ['Gạo tấm', 'Thịt nướng', 'Trứng gà', 'Sả', 'Nước mắm']
  },
  {
    name: 'Bánh xèo miền Trung', category: 'Món chính', price: '105000', featured: false,
    description: 'Bánh xèo nhỏ giòn rụm, nhân tôm thịt và giá, cuốn lá cải cùng rau thơm, chấm nước mắm tỏi ớt.',
    imageUrl: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=1200&q=85',
    ingredients: ['Tôm', 'Thịt heo', 'Bột nghệ', 'Rau sống', 'Nước mắm']
  },
  {
    name: 'Bò kho bánh mì', category: 'Món chính', price: '98000', featured: false,
    description: 'Bò hầm mềm cùng sả, cà rốt và gia vị ấm; ăn với bánh mì nướng giòn tại bàn.',
    imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=85',
    ingredients: ['Thịt bò', 'Bánh mì', 'Cà rốt', 'Sả', 'Gừng']
  },
  {
    name: 'Bún thịt nướng', category: 'Món chính', price: '85000', featured: false,
    description: 'Bún tươi, thịt nướng thơm lửa, rau sống, dưa chua, đậu phộng rang và nước mắm pha.',
    imageUrl: 'https://images.unsplash.com/photo-1569058242567-93de6f36f22e?auto=format&fit=crop&w=1200&q=85',
    ingredients: ['Bún tươi', 'Thịt nướng', 'Rau sống', 'Đậu phộng', 'Nước mắm']
  },
  {
    name: 'Chè sen long nhãn', category: 'Món ngọt', price: '52000', featured: false,
    description: 'Hạt sen nấu mềm trong nước đường thanh, nhãn tươi giòn ngọt và một chút dừa sợi.',
    imageUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=85',
    ingredients: ['Hạt sen', 'Dừa tươi']
  },
  {
    name: 'Cà phê sữa đá', category: 'Thức uống', price: '42000', featured: false,
    description: 'Cà phê rang đậm, pha phin chậm, thêm sữa đặc và đá viên.',
    imageUrl: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=1200&q=85',
    ingredients: ['Cà phê', 'Sữa đặc']
  },
  {
    name: 'Chè đậu xanh nước cốt dừa', category: 'Món ngọt', price: '48000', featured: false,
    description: 'Đậu xanh nấu mịn, vị bùi dịu, chan nước cốt dừa thơm và dùng mát.',
    imageUrl: 'https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=1200&q=85',
    ingredients: ['Đậu xanh', 'Nước cốt dừa', 'Dừa tươi']
  }
];

const chefs = [
  {
    name: 'Trần Minh An', title: 'Bếp trưởng điều hành', specialty: 'Món Hội An và nước dùng ninh chậm', sortOrder: 1,
    bio: 'Lớn lên bên bếp gia đình ở Hội An, anh An gìn giữ hương vị cũ bằng nguyên liệu theo mùa và cách nấu vừa tay.',
    imageUrl: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=900&q=85'
  },
  {
    name: 'Nguyễn Thị Hương', title: 'Bếp trưởng món miền Trung', specialty: 'Mì Quảng, cao lầu và món cuốn', sortOrder: 2,
    bio: 'Chị Hương theo đuổi những món ăn cân bằng: thơm, tươi, đậm vừa đủ và luôn có chút rau vườn trong mỗi đĩa.',
    imageUrl: 'https://images.unsplash.com/photo-1583394293214-28ded15ee548?auto=format&fit=crop&w=900&q=85'
  },
  {
    name: 'Lê Quốc Bảo', title: 'Bếp trưởng bánh và món ngọt', specialty: 'Chè truyền thống và món tráng miệng', sortOrder: 3,
    bio: 'Anh Bảo chọn vị ngọt thanh, ít cầu kỳ, để hạt sen, trái cây và nước cốt dừa được kể câu chuyện riêng.',
    imageUrl: 'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&w=900&q=85'
  }
];

function sampleReservationDate() {
  const target = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(target);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return new Date(`${values.year}-${values.month}-${values.day}T19:00:00+07:00`);
}

async function main() {
  await prisma.category.createMany({ data: categories, skipDuplicates: true });
  await prisma.ingredient.createMany({
    data: ingredientNames.map((name) => ({ name })),
    skipDuplicates: true
  });

  for (const dish of dishes) {
    const category = categories.find((item) => item.name === dish.category);
    const associations = dish.ingredients.map((name) => ({ ingredient: { connect: { name } } }));
    const fields = {
      category: { connect: { slug: category.slug } },
      name: dish.name,
      description: dish.description,
      price: dish.price,
      imageUrl: dish.imageUrl,
      isPublished: true,
      isAvailable: true,
      isFeatured: dish.featured
    };
    await prisma.dish.upsert({
      where: { slug: slugify(dish.name) },
      create: {
        ...fields,
        slug: slugify(dish.name),
        ingredients: { create: associations }
      },
      update: {
        ...fields,
        ingredients: { deleteMany: {}, create: associations }
      }
    });
  }

  for (const chef of chefs) {
    const existing = await prisma.chef.findFirst({ where: { name: chef.name }, select: { id: true } });
    if (existing) await prisma.chef.update({ where: { id: existing.id }, data: { ...chef, isPublished: true } });
    else await prisma.chef.create({ data: { ...chef, isPublished: true } });
  }

  await prisma.reservation.upsert({
    where: { referenceCode: 'BH-SEED-2026-01' },
    update: {
      customerName: 'Nguyễn Minh Anh', phone: '090 123 4567', email: 'minhanh@example.com',
      guestCount: 4, startsAt: sampleReservationDate(), customerNote: 'Bàn gần cửa sổ nếu thuận tiện.'
    },
    create: {
      referenceCode: 'BH-SEED-2026-01', customerName: 'Nguyễn Minh Anh', phone: '090 123 4567',
      email: 'minhanh@example.com', guestCount: 4, startsAt: sampleReservationDate(), status: 'PENDING',
      customerNote: 'Bàn gần cửa sổ nếu thuận tiện.'
    }
  });

  console.log(`Seed complete: ${categories.length} categories, ${ingredientNames.length} ingredients, ${dishes.length} dishes, ${chefs.length} chefs, 1 sample reservation.`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
