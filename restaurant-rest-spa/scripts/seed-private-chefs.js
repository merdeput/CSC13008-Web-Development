require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { createPrismaAdapter } = require('../../restaurant-site/src/lib/postgres-adapter');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to seed Supabase PostgreSQL.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: createPrismaAdapter(process.env.DIRECT_URL || process.env.DATABASE_URL)
});

const chefs = [
  {
    name: 'Phạm Hoàng Long', title: 'Bếp trưởng món nướng', specialty: 'Thịt nướng than và nước xốt thảo mộc',
    bio: 'Anh Long chọn nguyên liệu theo mùa, ướp vừa tay và canh lửa than để giữ độ mềm ngọt tự nhiên của từng món.',
    imageUrl: 'https://randomuser.me/api/portraits/men/11.jpg'
  },
  {
    name: 'Võ Ngọc Mai', title: 'Bếp phó món chay', specialty: 'Món chay miền Trung và rau vườn',
    bio: 'Chị Mai theo đuổi những món chay thanh vị, kết hợp rau địa phương, nấm tươi và gia vị truyền thống.',
    imageUrl: 'https://randomuser.me/api/portraits/women/11.jpg'
  },
  {
    name: 'Đặng Thanh Tùng', title: 'Bếp trưởng bếp nóng', specialty: 'Cá kho, món rim và gia vị miền Trung',
    bio: 'Anh Tùng chú trọng độ lửa và thời gian kho để món ăn đậm đà mà vẫn giữ được kết cấu nguyên liệu.',
    imageUrl: 'https://randomuser.me/api/portraits/men/12.jpg'
  },
  {
    name: 'Bùi Thị Lan Chi', title: 'Đầu bếp món cuốn', specialty: 'Gỏi cuốn, bánh tráng và rau thơm',
    bio: 'Chị Chi chăm chút từng phần rau, bún và nước chấm để các món cuốn luôn cân bằng, tươi nhẹ và dễ thưởng thức.',
    imageUrl: 'https://randomuser.me/api/portraits/women/12.jpg'
  },
  {
    name: 'Trương Gia Huy', title: 'Đầu bếp món nước', specialty: 'Phở bò và mì Quảng',
    bio: 'Anh Huy ninh nước dùng từ xương và gia vị rang, đồng thời điều chỉnh cách nêm để làm nổi bật vị riêng của từng món.',
    imageUrl: 'https://randomuser.me/api/portraits/men/13.jpg'
  },
  {
    name: 'Huỳnh Thị Bích Ngọc', title: 'Đầu bếp bánh truyền thống', specialty: 'Bánh quê và chè theo mùa',
    bio: 'Chị Ngọc gìn giữ công thức bánh nhà làm, ưu tiên nguyên liệu giản dị và vị ngọt vừa phải.',
    imageUrl: 'https://randomuser.me/api/portraits/women/13.jpg'
  },
  {
    name: 'Phan Quốc Khánh', title: 'Bếp trưởng thực đơn theo mùa', specialty: 'Hải sản sông và món cá địa phương',
    bio: 'Anh Khánh xây dựng món ăn theo nguồn hải sản trong ngày, kết hợp cách chế biến gọn để giữ vị tươi.',
    imageUrl: 'https://randomuser.me/api/portraits/men/14.jpg'
  },
  {
    name: 'Lý Minh Thư', title: 'Đầu bếp món chay', specialty: 'Nấm, đậu và món rau theo mùa',
    bio: 'Chị Thư phát triển món chay từ nguyên liệu địa phương, tạo chiều sâu hương vị bằng các loại gia vị tự nhiên.',
    imageUrl: 'https://randomuser.me/api/portraits/women/14.jpg'
  },
  {
    name: 'Nguyễn Anh Dũng', title: 'Đầu bếp bếp lửa', specialty: 'Cơm niêu và cá nướng',
    bio: 'Anh Dũng giữ lửa ổn định cho cơm niêu và món nướng, hướng đến lớp cháy thơm cùng phần ruột dẻo mềm.',
    imageUrl: 'https://randomuser.me/api/portraits/men/15.jpg'
  },
  {
    name: 'Trần Thu Hà', title: 'Bếp trưởng món khai vị', specialty: 'Gỏi miền Trung và rau trộn',
    bio: 'Chị Hà kết hợp rau vườn, trái cây chua dịu và nước trộn pha tại bếp cho những món khai vị tươi sáng.',
    imageUrl: 'https://randomuser.me/api/portraits/women/15.jpg'
  },
  {
    name: 'Lê Văn Phúc', title: 'Đầu bếp bếp nước', specialty: 'Nước dùng xương và bún truyền thống',
    bio: 'Anh Phúc theo sát từng công đoạn ninh, hớt bọt và nêm nước dùng để tạo vị trong, ngọt tự nhiên.',
    imageUrl: 'https://randomuser.me/api/portraits/men/16.jpg'
  },
  {
    name: 'Đỗ Mỹ Linh', title: 'Đầu bếp món tráng miệng', specialty: 'Chè hạt sen và bánh ngọt truyền thống',
    bio: 'Chị Linh yêu thích món tráng miệng thanh nhẹ, cân đối độ ngọt và giữ nguyên hương thơm của nguyên liệu chính.',
    imageUrl: 'https://randomuser.me/api/portraits/women/16.jpg'
  },
  {
    name: 'Phạm Đức Thành', title: 'Bếp trưởng món hải sản', specialty: 'Cá hấp, tôm rim và hải sản nướng',
    bio: 'Anh Thành chọn cách chế biến phù hợp với từng mẻ hải sản để giữ độ mọng, vị ngọt và hương thơm tự nhiên.',
    imageUrl: 'https://randomuser.me/api/portraits/men/17.jpg'
  },
  {
    name: 'Võ Thị Thanh Vân', title: 'Đầu bếp món gia đình', specialty: 'Món kho, canh và rau luộc',
    bio: 'Chị Vân mang tinh thần bữa cơm nhà vào thực đơn, với cách nêm nếm thân thuộc và nguyên liệu tươi mỗi ngày.',
    imageUrl: 'https://randomuser.me/api/portraits/women/17.jpg'
  },
  {
    name: 'Nguyễn Nhật Minh', title: 'Bếp trưởng bếp than', specialty: 'Thịt nướng và món xiên',
    bio: 'Anh Minh kiểm soát nhiệt than theo từng loại nguyên liệu, giúp món nướng dậy hương mà không lấn át vị chính.',
    imageUrl: 'https://randomuser.me/api/portraits/men/18.jpg'
  },
  {
    name: 'Đinh Ngọc Trâm', title: 'Đầu bếp món cuốn', specialty: 'Bánh tráng, rau thơm và nước chấm',
    bio: 'Chị Trâm chuẩn bị rau và nước chấm riêng cho từng món cuốn, giữ vị tươi cùng sự hài hòa trong mỗi phần ăn.',
    imageUrl: 'https://randomuser.me/api/portraits/women/18.jpg'
  },
  {
    name: 'Trần Quốc Việt', title: 'Bếp trưởng món Hội An', specialty: 'Cao lầu và hoành thánh',
    bio: 'Anh Việt nghiên cứu cách làm sợi, phần nhân và nước xốt để tái hiện hương vị Hội An theo phong cách chỉn chu.',
    imageUrl: 'https://randomuser.me/api/portraits/men/19.jpg'
  },
  {
    name: 'Hoàng Thị Yến Nhi', title: 'Đầu bếp bánh quê', specialty: 'Bánh ít, bánh tổ và bánh lá',
    bio: 'Chị Nhi làm bánh theo mẻ nhỏ, chú trọng độ dẻo của bột và hương thơm tự nhiên từ lá, nếp và dừa.',
    imageUrl: 'https://randomuser.me/api/portraits/women/19.jpg'
  },
  {
    name: 'Phạm Khắc Hòa', title: 'Đầu bếp bếp nóng', specialty: 'Lẩu, món kho và nước xốt',
    bio: 'Anh Hòa phối hợp gia vị địa phương với kỹ thuật nấu chậm để tạo nên những món nóng đậm vị, dễ dùng chung.',
    imageUrl: 'https://randomuser.me/api/portraits/men/20.jpg'
  },
  {
    name: 'Nguyễn Bảo Châu', title: 'Bếp trưởng món chay', specialty: 'Gỏi rau, nấm và đậu hũ',
    bio: 'Chị Châu xây dựng món chay đủ sắc vị từ rau củ, nấm và đậu hũ, hạn chế gia vị nặng để giữ vị tự nhiên.',
    imageUrl: 'https://randomuser.me/api/portraits/women/20.jpg'
  },
  {
    name: 'Dương Thành Đạt', title: 'Đầu bếp món nướng', specialty: 'Thịt nướng sả và món xiên',
    bio: 'Anh Đạt chuẩn bị phần ướp từ thảo mộc, sả và gia vị pha tại bếp, sau đó nướng theo từng mẻ nhỏ.',
    imageUrl: 'https://randomuser.me/api/portraits/men/21.jpg'
  },
  {
    name: 'Lâm Thị Kim Oanh', title: 'Bếp trưởng bếp nguội', specialty: 'Gỏi, rau trộn và món khai vị',
    bio: 'Chị Oanh chú trọng độ tươi, cách cắt và sự cân bằng giữa chua, ngọt, mặn trong các món khai vị.',
    imageUrl: 'https://randomuser.me/api/portraits/women/21.jpg'
  },
  {
    name: 'Trương Quốc Bảo', title: 'Đầu bếp món nước', specialty: 'Bún, mì và nước dùng truyền thống',
    bio: 'Anh Bảo chăm chút từng phần nước dùng và rau ăn kèm để mỗi tô bún, tô mì có hương vị rõ ràng.',
    imageUrl: 'https://randomuser.me/api/portraits/men/22.jpg'
  },
  {
    name: 'Phan Mai Anh', title: 'Đầu bếp món ngọt', specialty: 'Chè hạt sen và món ngọt từ trái cây',
    bio: 'Chị Mai Anh ưu tiên trái cây theo mùa, hạt sen và nước cốt dừa để tạo món ngọt dịu, phù hợp sau bữa ăn.',
    imageUrl: 'https://randomuser.me/api/portraits/women/22.jpg'
  },
  {
    name: 'Vũ Hoàng Nam', title: 'Bếp trưởng bếp gia đình', specialty: 'Cơm Việt và cá kho',
    bio: 'Anh Nam theo đuổi những món cơm Việt gần gũi, nêm nếm cân bằng và trình bày giản dị.',
    imageUrl: 'https://randomuser.me/api/portraits/men/23.jpg'
  },
  {
    name: 'Nguyễn Thị Diễm My', title: 'Đầu bếp bánh truyền thống', specialty: 'Bánh nếp, bánh đậu xanh và bánh lá',
    bio: 'Chị My gìn giữ kỹ thuật làm bánh truyền thống, chú ý kết cấu mềm dẻo và hương thơm từ nguyên liệu bản địa.',
    imageUrl: 'https://randomuser.me/api/portraits/women/23.jpg'
  },
  {
    name: 'Lê Thanh Bình', title: 'Đầu bếp bếp than', specialty: 'Cá nướng và thịt nướng lá chuối',
    bio: 'Anh Bình kết hợp than hồng và lá chuối để món nướng giữ độ ẩm, đồng thời có mùi thơm mộc tự nhiên.',
    imageUrl: 'https://randomuser.me/api/portraits/men/24.jpg'
  },
  {
    name: 'Đặng Thị Thúy An', title: 'Bếp trưởng món rau', specialty: 'Rau theo mùa và món hấp',
    bio: 'Chị An làm nổi bật nguyên liệu rau củ bằng cách chế biến nhẹ, giữ màu sắc, độ giòn và vị ngọt tự nhiên.',
    imageUrl: 'https://randomuser.me/api/portraits/women/24.jpg'
  },
  {
    name: 'Cao Minh Khoa', title: 'Bếp phó món nước', specialty: 'Bún bò và cao lầu',
    bio: 'Anh Khoa hoàn thiện các món nước qua nhiều lần thử vị, cân đối độ đậm của nước dùng với sợi và rau ăn kèm.',
    imageUrl: 'https://randomuser.me/api/portraits/men/25.jpg'
  },
  {
    name: 'Hồ Thị Quỳnh Nga', title: 'Đầu bếp món ngọt', specialty: 'Chè truyền thống và trái cây theo mùa',
    bio: 'Chị Nga chuẩn bị chè và món trái cây theo mùa, giữ vị ngọt thanh cùng cách trình bày gọn gàng.',
    imageUrl: 'https://randomuser.me/api/portraits/women/25.jpg'
  }
].map((chef, index) => ({ ...chef, isPublished: false, sortOrder: index + 4 }));

async function main() {
  const names = chefs.map(({ name }) => name);
  const existing = await prisma.chef.findMany({ where: { name: { in: names } }, select: { name: true } });
  const existingNames = new Set(existing.map(({ name }) => name));
  const missing = chefs.filter(({ name }) => !existingNames.has(name));

  if (missing.length) await prisma.chef.createMany({ data: missing });

  const saved = await prisma.chef.findMany({
    where: { name: { in: names } },
    select: { name: true, title: true, specialty: true, bio: true, imageUrl: true, isPublished: true, sortOrder: true }
  });
  const valid = saved.length === chefs.length && saved.every((chef) =>
    chef.title && chef.specialty && chef.bio && chef.imageUrl && chef.isPublished === false
  );

  if (!valid) throw new Error(`Verification failed: expected ${chefs.length} complete unpublished profiles; found ${saved.length}.`);
  console.log(`Verified ${saved.length} complete unpublished chef profiles; created ${missing.length}, skipped ${existing.length}.`);
}

main()
  .catch((error) => {
    console.error('Private chef seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
