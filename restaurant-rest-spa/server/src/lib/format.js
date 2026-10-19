const TIME_ZONE = process.env.RESTAURANT_TIME_ZONE || 'Asia/Ho_Chi_Minh';

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0
});

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

function formatVnd(value) {
  return vndFormatter.format(Number(value));
}

function formatDateTimeHcm(value) {
  if (!value) return '';
  return dateTimeFormatter.format(new Date(value));
}

function toHcmDateTimeLocal(value) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value));
  const part = Object.fromEntries(parts.map(({ type, value: item }) => [type, item]));
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
}

function todayInHcm() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const part = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${part.year}-${part.month}-${part.day}`;
}

module.exports = { TIME_ZONE, formatVnd, formatDateTimeHcm, toHcmDateTimeLocal, todayInHcm };
