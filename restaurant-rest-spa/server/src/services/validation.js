const { getRestaurantConfig } = require('../lib/restaurant-config');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUSES = ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(value) {
  const text = asText(value);
  return text || null;
}

function asStringArray(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').map((item) => item.trim());
  return typeof value === 'string' && value ? [value.trim()] : [];
}

function asIdArray(value) {
  if (Array.isArray(value)) {
    if (value.some((item) => typeof item !== 'string')) return null;
    return [...new Set(value.map((item) => item.trim()))];
  }
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (value == null) return [];
  return null;
}

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function checkedImageUrl(value, errors) {
  const url = optionalText(value);
  if (!url) return null;
  if (url.length > 2048) errors.imageUrl = 'Đường dẫn ảnh tối đa 2048 ký tự.';
  else {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) errors.imageUrl = 'Ảnh cần dùng đường dẫn http hoặc https.';
    } catch (_error) {
      errors.imageUrl = 'Vui lòng nhập đường dẫn ảnh hợp lệ.';
    }
  }
  return url;
}

function validateDishInput(input = {}) {
  const errors = {};
  const name = asText(input.name);
  const description = asText(input.description);
  const categoryId = asText(input.categoryId);
  const chefId = asText(input.chefId);
  const priceText = asText(input.price);
  const ingredientIds = [...new Set(asStringArray(input.ingredientIds))];
  const data = {
    name,
    description,
    categoryId,
    chefId: chefId || null,
    price: priceText,
    imageUrl: checkedImageUrl(input.imageUrl, errors),
    isPublished: input.isPublished === 'on' || input.isPublished === 'true' || input.isPublished === true,
    isAvailable: input.isAvailable === 'on' || input.isAvailable === 'true' || input.isAvailable === true,
    isFeatured: input.isFeatured === 'on' || input.isFeatured === 'true' || input.isFeatured === true,
    ingredientIds
  };

  if (!name) errors.name = 'Vui lòng nhập tên món ăn.';
  else if (name.length > 120) errors.name = 'Tên món ăn tối đa 120 ký tự.';
  if (!description) errors.description = 'Vui lòng nhập mô tả món ăn.';
  else if (description.length > 2400) errors.description = 'Mô tả tối đa 2400 ký tự.';
  if (!isUuid(categoryId)) errors.categoryId = 'Vui lòng chọn một danh mục hợp lệ.';
  if (chefId && !isUuid(chefId)) errors.chefId = 'Vui lòng chọn một đầu bếp hợp lệ.';
  if (!/^\d{1,12}$/.test(priceText)) errors.price = 'Giá phải là số nguyên VND không âm, tối đa 12 chữ số.';
  if (ingredientIds.length > 30 || ingredientIds.some((id) => !isUuid(id))) errors.ingredientIds = 'Danh sách nguyên liệu không hợp lệ.';
  return { data, errors };
}

function validateChefInput(input = {}) {
  const errors = {};
  const sortOrderText = typeof input.sortOrder === 'number'
    ? String(input.sortOrder)
    : asText(input.sortOrder || '0');
  const sortOrder = /^\d+$/.test(sortOrderText) ? Number(sortOrderText) : NaN;
  const hasDishIds = Object.hasOwn(input, 'dishIds');
  const dishIds = hasDishIds ? asIdArray(input.dishIds) : undefined;
  const data = {
    name: asText(input.name),
    title: asText(input.title),
    bio: optionalText(input.bio),
    specialty: optionalText(input.specialty),
    imageUrl: checkedImageUrl(input.imageUrl, errors),
    isPublished: input.isPublished === 'on' || input.isPublished === 'true' || input.isPublished === true,
    sortOrder,
    ...(hasDishIds ? { dishIds: dishIds || [] } : {})
  };
  if (!data.name) errors.name = 'Vui lòng nhập tên đầu bếp.';
  else if (data.name.length > 120) errors.name = 'Tên tối đa 120 ký tự.';
  if (!data.title) errors.title = 'Vui lòng nhập chức danh.';
  else if (data.title.length > 140) errors.title = 'Chức danh tối đa 140 ký tự.';
  if (data.bio && data.bio.length > 2400) errors.bio = 'Tiểu sử tối đa 2400 ký tự.';
  if (data.specialty && data.specialty.length > 180) errors.specialty = 'Sở trường tối đa 180 ký tự.';
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) errors.sortOrder = 'Thứ tự phải là số nguyên không âm.';
  if (hasDishIds && (!dishIds || dishIds.length > 200 || dishIds.some((id) => !isUuid(id)))) {
    errors.dishIds = 'Danh sách món phụ trách không hợp lệ.';
  }
  return { data, errors };
}

function validateIngredientInput(input = {}) {
  const name = asText(input.name);
  const errors = {};
  if (!name) errors.name = 'Vui lòng nhập tên nguyên liệu.';
  else if (name.length > 100) errors.name = 'Tên nguyên liệu tối đa 100 ký tự.';
  return { data: { name }, errors };
}

function validateCategoryInput(input = {}) {
  const name = asText(input.name);
  const errors = {};
  if (!name) errors.name = 'Vui lòng nhập tên danh mục.';
  else if (name.length > 80) errors.name = 'Tên danh mục tối đa 80 ký tự.';
  return { data: { name }, errors };
}

function parseReservationDateTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const parsed = new Date(`${date}T${time}:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(parsed);
  const parts = Object.fromEntries(local.map(({ type, value }) => [type, value]));
  if (`${parts.year}-${parts.month}-${parts.day}` !== date || `${parts.hour}:${parts.minute}` !== time) return null;
  return parsed;
}

function validateReservationInput(input = {}, options = {}) {
  const config = options.config || getRestaurantConfig();
  const errors = {};
  const customerName = asText(input.customerName);
  const phone = asText(input.phone);
  const email = asText(input.email);
  const customerNote = asText(input.customerNote);
  const guestCountText = asText(input.guestCount);
  const guestCount = /^\d+$/.test(guestCountText) ? Number(guestCountText) : NaN;
  const date = asText(input.date);
  const time = asText(input.time);
  const startsAt = parseReservationDateTime(date, time);
  const data = { customerName, phone, email: email || null, guestCount, date, time, startsAt, customerNote: customerNote || null };

  if (!customerName) errors.customerName = 'Vui lòng nhập họ tên.';
  else if (customerName.length > 120) errors.customerName = 'Họ tên tối đa 120 ký tự.';
  if (!phone) errors.phone = 'Vui lòng nhập số điện thoại.';
  else if (phone.length < 7 || phone.length > 40) errors.phone = 'Số điện thoại cần từ 7 đến 40 ký tự.';
  else if (!/^[+()\d\s.-]+$/.test(phone)) errors.phone = 'Số điện thoại chỉ dùng chữ số và ký tự + ( ) . -.';
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) errors.email = 'Vui lòng nhập email hợp lệ.';
  if (!Number.isSafeInteger(guestCount) || guestCount < 1) errors.guestCount = 'Số khách phải là số nguyên lớn hơn 0.';
  else if (guestCount > config.maxPartySize) errors.guestCount = `Nhóm khách tối đa ${config.maxPartySize} người theo cấu hình hiện tại.`;
  if (!startsAt) errors.date = 'Vui lòng chọn ngày và giờ hợp lệ.';
  else {
    if (startsAt.getTime() <= (options.now || new Date()).getTime()) errors.date = 'Thời gian đặt bàn phải ở trong tương lai.';
    if (time < config.openingTime || time >= config.closingTime) {
      errors.time = `Nhà hàng nhận yêu cầu từ ${config.openingTime} đến trước ${config.closingTime}.`;
    }
  }
  if (customerNote.length > 1200) errors.customerNote = 'Lời nhắn tối đa 1200 ký tự.';

  if (options.admin) {
    data.adminNote = optionalText(input.adminNote);
    data.status = asText(input.status);
    if (!STATUSES.includes(data.status)) errors.status = 'Trạng thái không hợp lệ.';
    if (data.adminNote && data.adminNote.length > 1200) errors.adminNote = 'Ghi chú nội bộ tối đa 1200 ký tự.';
  }
  return { data, errors };
}

function validateReservationFilters(query = {}) {
  const status = STATUSES.includes(asText(query.status)) ? asText(query.status) : '';
  const from = /^\d{4}-\d{2}-\d{2}$/.test(asText(query.from)) ? asText(query.from) : '';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(asText(query.to)) ? asText(query.to) : '';
  return { status, from, to };
}

module.exports = {
  UUID_RE,
  STATUSES,
  asText,
  isUuid,
  validateDishInput,
  validateChefInput,
  validateIngredientInput,
  validateCategoryInput,
  parseReservationDateTime,
  validateReservationInput,
  validateReservationFilters
};
