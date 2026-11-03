function toMinuteOfDay(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function currentMinuteOfDay(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

function currentLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidLocalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function effectivePrice(product, date = new Date()) {
  let price = Number(product.price);
  const floor = Math.max(0, Number(product.minPrice || 0));
  (Array.isArray(product.schedule) ? product.schedule : [])
    .slice()
    .sort((left, right) => toMinuteOfDay(left.time) - toMinuteOfDay(right.time))
    .forEach((schedule) => {
      if (toMinuteOfDay(schedule.time) <= currentMinuteOfDay(date)) {
        price = Math.max(floor, Math.min(price, Number(schedule.price)));
      }
    });
  return price;
}

function validateSchedule(schedule, price, minPrice) {
  if (!Array.isArray(schedule)) return 'Jadwal diskon harus berupa daftar yang valid.';
  if (!Number.isInteger(price) || !Number.isInteger(minPrice) || minPrice < 0 || minPrice > price) {
    return 'Harga terendah harus berada antara Rp 0 dan harga promo.';
  }

  const usedTimes = new Set();
  let previousPrice = price;
  for (const entry of schedule.slice().sort((left, right) =>
    toMinuteOfDay(left?.time) - toMinuteOfDay(right?.time))) {
    const minute = toMinuteOfDay(entry?.time);
    const scheduledPrice = Number(entry?.price);
    if (minute === null || !Number.isInteger(scheduledPrice) ||
        scheduledPrice < minPrice || scheduledPrice > price) {
      return 'Setiap jadwal harus memiliki jam valid dan harga antara harga terendah dan harga promo.';
    }
    if (usedTimes.has(minute)) return 'Jam jadwal diskon tidak boleh duplikat.';
    if (scheduledPrice > previousPrice) {
      return 'Harga dalam jadwal diskon harus tetap atau semakin turun.';
    }
    usedTimes.add(minute);
    previousPrice = scheduledPrice;
  }

  return null;
}

function isProductExpired(product, date = new Date()) {
  if (product.status === 'Expired') return true;
  const today = currentLocalDate(date);
  if (product.expiryDate && product.expiryDate < today) return true;
  if (product.expiryDate === today && product.pickupEnd &&
      toMinuteOfDay(product.pickupEnd) < currentMinuteOfDay(date)) return true;
  return false;
}

function canMarkNoShow(order, product, date = new Date()) {
  if (!['Awaiting pickup', 'Ready for pickup'].includes(order.status)) return false;
  const pickupEnd = toMinuteOfDay(order.pickupEnd || product?.pickupEnd);
  const orderDate = order.createdAt ? new Date(order.createdAt) : null;
  if (pickupEnd === null || !orderDate || Number.isNaN(orderDate.getTime()) ||
      orderDate.getTime() > date.getTime()) return false;
  const orderLocalDate = currentLocalDate(orderDate);
  const today = currentLocalDate(date);
  if (orderLocalDate > today) return false;
  return orderLocalDate < today || currentMinuteOfDay(date) > pickupEnd;
}

module.exports = {
  canMarkNoShow,
  currentLocalDate,
  currentMinuteOfDay,
  effectivePrice,
  isValidLocalDate,
  isProductExpired,
  toMinuteOfDay,
  validateSchedule,
};
