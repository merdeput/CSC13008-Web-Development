// Local visual review only. This process uses in-memory examples, never Supabase.
const { createApp } = require('../src/app');

const category = { id: '291550bb-0084-4f33-805e-26637edff8c6', name: 'Món nước', slug: 'mon-nuoc', sortOrder: 1 };
const ingredients = [
  { id: 'f0a04e5c-fc92-4897-9cb4-a5d0a893c0f7', name: 'Bánh cao lầu' },
  { id: 'c1cf927e-c17a-4ce6-bec1-976e034b9602', name: 'Rau thơm' },
  { id: 'a0207ec1-d80b-4f5d-8661-28da234db177', name: 'Đậu phộng' }
];
const now = new Date();
const dishes = [
  ['143bf0e8-7c88-4ecb-8da5-b901cb082cac', 'Cao lầu Hội An', 'cao-lau-hoi-an', '89000', true],
  ['a13f2670-73b5-49c5-82a9-8d16d2b571b2', 'Mì Quảng gà', 'mi-quang-ga', '82000', true],
  ['a8542f2d-1db9-405f-83c8-f296d742bf76', 'Bún chả Hà Nội', 'bun-cha-ha-noi', '99000', true],
  ['42f4c752-9d69-46cb-b65b-7b0bf41ca689', 'Phở bò tái', 'pho-bo-tai', '95000', true]
].map(([id, name, slug, price, isFeatured], index) => ({
  id, categoryId: category.id, category, name, slug,
  description: 'Nước dùng ninh chậm, rau thơm tươi và gia vị vừa tay — món Việt thân quen được nấu tại bếp mỗi ngày.',
  price, imageUrl: `https://images.unsplash.com/photo-${['1569718212165-3a8278d5f624', '1565123409695-7b5ef63a2efb', '1555939594-58d7cb561ad1', '1582878826629-29b7ad1cdc43'][index]}?auto=format&fit=crop&w=1200&q=85`,
  isPublished: true, isAvailable: index !== 2, isFeatured,
  ingredients: ingredients.slice(0, index % 3 + 1).map((ingredient) => ({ ingredientId: ingredient.id, ingredient })),
  createdAt: now, updatedAt: now
}));
const chefs = [
  { id: '81f7350b-9af3-4564-88bc-0d38a728a59e', name: 'Trần Minh An', title: 'Bếp trưởng điều hành', specialty: 'Món Hội An và nước dùng ninh chậm', bio: 'Giữ vị cũ bằng nguyên liệu theo mùa và cách nêm nếm vừa tay.', imageUrl: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=900&q=85', isPublished: true, sortOrder: 1 },
  { id: '65b1e7cb-8304-4da7-9024-e62796b74388', name: 'Nguyễn Thị Hương', title: 'Bếp trưởng món miền Trung', specialty: 'Mì Quảng, cao lầu và món cuốn', bio: 'Chăm chút những món ăn cân bằng, tươi và đậm vừa đủ.', imageUrl: 'https://images.unsplash.com/photo-1583394293214-28ded15ee548?auto=format&fit=crop&w=900&q=85', isPublished: true, sortOrder: 2 },
  { id: 'acdb70e1-0ab6-49de-b020-343ce08f6cc6', name: 'Lê Quốc Bảo', title: 'Bếp trưởng bánh và món ngọt', specialty: 'Chè truyền thống', bio: 'Ưu tiên vị ngọt thanh và nguyên liệu tự nhiên.', imageUrl: 'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&w=900&q=85', isPublished: true, sortOrder: 3 }
];
const reservation = {
  id: '0ac6032d-0681-480e-a667-9f38f9049762', referenceCode: 'BH-4B81C0D2', customerName: 'Lê Minh',
  phone: '090 123 4567', email: 'minh@example.com', guestCount: 4,
  startsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), status: 'PENDING',
  customerNote: 'Bàn gần cửa sổ nếu thuận tiện.', adminNote: '', createdAt: now, updatedAt: now
};

const services = {
  dishes: {
    listFeatured: async (limit) => dishes.filter((dish) => dish.isFeatured).slice(0, limit),
    listPublic: async ({ categoryId: filterCategoryId, q } = {}) => dishes.filter((dish) => dish.isPublished && (!filterCategoryId || dish.categoryId === filterCategoryId) && (!q || dish.name.toLowerCase().includes(q.toLowerCase()))),
    listCategories: async () => [category],
    findPublicById: async (id) => dishes.find((dish) => dish.id === id && dish.isPublished) || null,
    listAdmin: async ({ page = 1 } = {}) => ({ items: dishes, total: dishes.length, page: Number(page) || 1, pageCount: 1 }),
    findById: async (id) => dishes.find((dish) => dish.id === id) || null,
    formOptions: async () => ({ categories: [category], ingredients }),
    create: async (data) => ({ ...data, id: '5d2d95a8-97d5-44bd-a52e-b44ac7b4506e', slug: 'preview-dish', category, ingredients: [] }),
    update: async (id, data) => ({ ...dishes.find((dish) => dish.id === id), ...data }),
    remove: async () => true
  },
  chefs: {
    listPublished: async (limit) => chefs.filter((chef) => chef.isPublished).slice(0, limit),
    listAdmin: async ({ page = 1 } = {}) => ({ items: chefs, total: chefs.length, page: Number(page) || 1, pageCount: 1 }),
    findById: async (id) => chefs.find((chef) => chef.id === id) || null,
    create: async (data) => ({ ...data, id: '65b1e7cb-8304-4da7-9024-e62796b74388' }),
    update: async (id, data) => ({ ...chefs.find((chef) => chef.id === id), ...data }),
    remove: async () => true
  },
  reservations: {
    create: async (data) => ({ ...data, id: reservation.id, referenceCode: reservation.referenceCode, status: 'PENDING' }),
    update: async (_id, data) => ({ reservation: { ...reservation, ...data } }),
    listAdmin: async ({ page = 1, status = '', from = '', to = '' } = {}) => ({ items: status && status !== reservation.status ? [] : [reservation], total: 1, page: Number(page) || 1, pageCount: 1, filters: { status, from, to } }),
    findById: async (id) => id === reservation.id ? reservation : null,
    upcoming: async () => [reservation],
    count: async () => 1,
    remove: async () => true
  },
  admin: { overview: async () => ({ dishCount: dishes.length, chefCount: chefs.length, reservationCount: 1 }) }
};

const port = Number.parseInt(process.env.PREVIEW_PORT || '4173', 10);
createApp({ services }).listen(port, '127.0.0.1', () => {
  console.log(`Mock visual preview: http://127.0.0.1:${port} (no database writes)`);
});
