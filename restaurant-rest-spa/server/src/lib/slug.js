function slugify(value) {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (letter) => letter === 'Đ' ? 'D' : 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
  return slug || 'mon-an';
}

async function uniqueSlug(model, base, exceptId) {
  const root = slugify(base);
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const candidate = suffix === 1 ? root : `${root.slice(0, 112)}-${suffix}`;
    const found = await model.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!found || found.id === exceptId) return candidate;
  }
  throw new Error('Could not generate a unique slug after 100 attempts.');
}

module.exports = { slugify, uniqueSlug };
