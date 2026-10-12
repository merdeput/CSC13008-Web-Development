const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function configuredTime(name, fallback) {
  const value = process.env[name] || fallback;
  return TIME_RE.test(value) ? value : fallback;
}

function getRestaurantConfig() {
  const openingTime = configuredTime('RESTAURANT_OPENING_TIME', '11:00');
  const closingTime = configuredTime('RESTAURANT_CLOSING_TIME', '22:00');
  const parsedPartySize = Number.parseInt(process.env.RESTAURANT_MAX_PARTY_SIZE || '12', 10);
  const maxPartySize = Number.isInteger(parsedPartySize) && parsedPartySize > 0 ? parsedPartySize : 12;
  return {
    timeZone: process.env.RESTAURANT_TIME_ZONE || 'Asia/Ho_Chi_Minh',
    openingTime,
    closingTime,
    maxPartySize
  };
}

module.exports = { getRestaurantConfig };
