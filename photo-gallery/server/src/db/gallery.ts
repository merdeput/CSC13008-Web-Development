import type { PrismaClient } from "../generated/prisma/client.js";

const pageSize = 24;
const galleryPageSize = 12;

export class GalleryRepository {
  constructor(private readonly prisma: PrismaClient, private readonly variantBaseUrl: (bucket: string, key: string) => string) {}

  private where(params: URLSearchParams) {
    const categories = params.getAll("category").slice(0, 20);
    const tags = params.getAll("tags").slice(0, 30);
    const photographers = params.getAll("photographer").slice(0, 20);
    const years = params.getAll("year").map(Number).filter((year) => Number.isInteger(year) && year >= 1900 && year <= 2200);
    const competitions = params.getAll("competition").slice(0, 10);
    const awards = params.getAll("award").slice(0, 20);
    const continents = params.getAll("continent").slice(0, 10);
    const regions = params.getAll("region").slice(0, 20);
    const countries = params.getAll("country").slice(0, 50);
    const species = params.getAll("species").slice(0, 30);
    const sharedIds = [...params.getAll("photos").flatMap((value) => value.split(",")), ...params.getAll("photo")]
      .filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)).slice(0, 100);
    const query = params.get("q")?.trim().slice(0, 100);
    const conditions: Record<string, unknown>[] = [];
    if (categories.length) conditions.push({ category: { in: categories } });
    if (tags.length) conditions.push({ tags: { some: { tag: { slug: { in: tags } } } } });
    if (photographers.length) conditions.push({ photographerCredit: { in: photographers } });
    if (years.length) conditions.push({ OR: years.map((year) => ({ photoYear: year })) });
    if (competitions.length) conditions.push({ competition: { in: competitions } });
    if (awards.length) conditions.push({ award: { in: awards } });
    if (continents.length) conditions.push({ locationContinent: { in: continents } });
    if (regions.length) conditions.push({ locationRegion: { in: regions } });
    if (countries.length) conditions.push({ locationCountry: { in: countries } });
    if (species.length) conditions.push({ OR: species.map((value) => ({ OR: [{ speciesCommon: { equals: value, mode: "insensitive" as const } }, { speciesLatin: { equals: value, mode: "insensitive" as const } }] })) });
    if (sharedIds.length) conditions.push({ id: { in: sharedIds } });
    if (query) conditions.push({ OR: [
      { title: { contains: query, mode: "insensitive" as const } },
      { caption: { contains: query, mode: "insensitive" as const } },
      { category: { contains: query, mode: "insensitive" as const } },
      { photographerCredit: { contains: query, mode: "insensitive" as const } },
      { locationName: { contains: query, mode: "insensitive" as const } },
        { speciesCommon: { contains: query, mode: "insensitive" as const } },
        { speciesLatin: { contains: query, mode: "insensitive" as const } },
      { tags: { some: { tag: { name: { contains: query, mode: "insensitive" as const } } } } },
    ] });
    return {
      status: "ready" as const,
      ...(conditions.length ? { AND: conditions } : {}),
    };
  }

  async list(params: URLSearchParams) {
    const page = Math.max(1, Math.min(10_000, Number(params.get("page")) || 1));
    const where = this.where(params);
    const sort = params.get("sort") === "oldest" ? "asc" : "desc";
    const [total, photos] = await Promise.all([
      this.prisma.photo.count({ where }),
      this.prisma.photo.findMany({
        where,
        orderBy: [{ createdAt: sort }, { id: "asc" }],
        skip: (page - 1) * galleryPageSize,
        take: galleryPageSize,
        include: { owner: { select: { id: true, username: true, displayName: true, isSystem: true } }, tags: { include: { tag: true } }, variants: { orderBy: { width: "asc" } } },
      }),
    ]);
    return {
      photos: photos.map((photo) => ({
        id: photo.id, title: photo.title, caption: photo.caption, altText: photo.altText,
        category: photo.category, photographerCredit: photo.photographerCredit,
        locationName: photo.locationName, locationContinent: photo.locationContinent, locationRegion: photo.locationRegion, locationCountry: photo.locationCountry,
        competition: photo.competition, award: photo.award, photoYear: photo.photoYear,
        speciesCommon: photo.speciesCommon, speciesLatin: photo.speciesLatin, story: photo.story, createdAt: photo.createdAt.toISOString(),
        owner: photo.owner ? { id: photo.owner.id, username: photo.owner.username, displayName: photo.owner.displayName, isSystem: photo.owner.isSystem } : null,
        width: photo.variants.find((variant) => variant.version === photo.currentVersion)?.width ?? 0, height: photo.variants.find((variant) => variant.version === photo.currentVersion)?.height ?? 0,
        tags: photo.tags.map(({ tag }) => ({ name: tag.name, slug: tag.slug })),
        variants: photo.variants.filter((variant) => variant.version === photo.currentVersion).map((variant) => ({
          width: variant.width, height: variant.height,
          url: this.variantBaseUrl(variant.bucket, variant.key),
        })),
      })),
      total, page, pageSize: galleryPageSize, pages: Math.ceil(total / galleryPageSize),
    };
  }

  async detail(id: string) {
    const photo = await this.prisma.photo.findFirst({
      where: { id, status: "ready" },
      include: { owner: { select: { id: true, username: true, displayName: true, isSystem: true } }, tags: { include: { tag: true } }, variants: { orderBy: { width: "asc" } } },
    });
    if (!photo) return null;
    return {
      id: photo.id, title: photo.title, caption: photo.caption, altText: photo.altText,
      category: photo.category, photographerCredit: photo.photographerCredit,
      locationName: photo.locationName, locationContinent: photo.locationContinent, locationRegion: photo.locationRegion, locationCountry: photo.locationCountry,
      competition: photo.competition, award: photo.award, photoYear: photo.photoYear,
      speciesCommon: photo.speciesCommon, speciesLatin: photo.speciesLatin, story: photo.story, createdAt: photo.createdAt.toISOString(),
      owner: photo.owner ? { id: photo.owner.id, username: photo.owner.username, displayName: photo.owner.displayName, isSystem: photo.owner.isSystem } : null,
      width: photo.variants.find((variant) => variant.version === photo.currentVersion)?.width ?? 0, height: photo.variants.find((variant) => variant.version === photo.currentVersion)?.height ?? 0,
      tags: photo.tags.map(({ tag }) => ({ name: tag.name, slug: tag.slug })),
      variants: photo.variants.filter((variant) => variant.version === photo.currentVersion).map((variant) => ({ width: variant.width, height: variant.height, url: this.variantBaseUrl(variant.bucket, variant.key) })),
    };
  }

  async profilePhotos(userId: string, requestedPage: number) {
    const page = Math.max(1, Math.min(10_000, requestedPage || 1));
    const where = { status: "ready" as const, ownerId: userId };
    const [total, photos] = await Promise.all([
      this.prisma.photo.count({ where }),
      this.prisma.photo.findMany({
        where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
        include: { owner: { select: { id: true, username: true, displayName: true, isSystem: true } }, tags: { include: { tag: true } }, variants: { orderBy: { width: "asc" } } },
      }),
    ]);
    return {
      photos: photos.map((photo) => ({
        id: photo.id, title: photo.title, caption: photo.caption, altText: photo.altText,
        category: photo.category, photographerCredit: photo.photographerCredit, locationName: photo.locationName,
        locationContinent: photo.locationContinent, locationRegion: photo.locationRegion, locationCountry: photo.locationCountry,
        competition: photo.competition, award: photo.award, photoYear: photo.photoYear,
        speciesCommon: photo.speciesCommon, speciesLatin: photo.speciesLatin, story: photo.story, createdAt: photo.createdAt.toISOString(),
        owner: photo.owner ? { id: photo.owner.id, username: photo.owner.username, displayName: photo.owner.displayName, isSystem: photo.owner.isSystem } : null,
        width: photo.variants.find((variant) => variant.version === photo.currentVersion)?.width ?? 0, height: photo.variants.find((variant) => variant.version === photo.currentVersion)?.height ?? 0,
        tags: photo.tags.map(({ tag }) => ({ name: tag.name, slug: tag.slug })),
        variants: photo.variants.filter((variant) => variant.version === photo.currentVersion).map((variant) => ({ width: variant.width, height: variant.height, url: this.variantBaseUrl(variant.bucket, variant.key) })),
      })),
      total, page, pageSize, pages: Math.ceil(total / pageSize),
    };
  }

  async filters() {
    const [categories, tags, photographers, locations, years, competitions, awards, species] = await Promise.all([
      this.prisma.photo.findMany({ where: { status: "ready", category: { not: null } }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
      this.prisma.tag.findMany({ where: { photos: { some: { photo: { status: "ready" } } } }, select: { name: true, slug: true, _count: { select: { photos: true } } }, orderBy: { name: "asc" } }),
      this.prisma.photo.findMany({ where: { status: "ready", photographerCredit: { not: null } }, distinct: ["photographerCredit"], select: { photographerCredit: true }, orderBy: { photographerCredit: "asc" } }),
      this.prisma.photo.findMany({ where: { status: "ready", locationCountry: { not: null } }, distinct: ["locationContinent", "locationRegion", "locationCountry"], select: { locationContinent: true, locationRegion: true, locationCountry: true }, orderBy: [{ locationContinent: "asc" }, { locationRegion: "asc" }, { locationCountry: "asc" }] }),
      this.prisma.photo.findMany({ where: { status: "ready", photoYear: { not: null } }, distinct: ["photoYear"], select: { photoYear: true }, orderBy: { photoYear: "desc" } }),
      this.prisma.photo.findMany({ where: { status: "ready", competition: { not: null } }, distinct: ["competition"], select: { competition: true }, orderBy: { competition: "asc" } }),
      this.prisma.photo.findMany({ where: { status: "ready", award: { not: null } }, distinct: ["award"], select: { award: true }, orderBy: { award: "asc" } }),
      this.prisma.photo.findMany({ where: { status: "ready", speciesCommon: { not: null } }, distinct: ["speciesCommon", "speciesLatin"], select: { speciesCommon: true, speciesLatin: true }, orderBy: { speciesCommon: "asc" } }),
    ]);
    return {
      categories: categories.map((item) => item.category).filter((item): item is string => Boolean(item)),
      tags: tags.map(({ name, slug, _count }) => ({ name, slug, count: _count.photos })),
      photographers: photographers.map((item) => item.photographerCredit).filter((item): item is string => Boolean(item)),
      locations: locations.filter((item) => item.locationContinent && item.locationCountry).map((item) => ({ continent: item.locationContinent!, region: item.locationRegion, country: item.locationCountry! })),
      years: years.map((item) => item.photoYear).filter((item): item is number => item !== null),
      competitions: competitions.map((item) => item.competition).filter((item): item is string => Boolean(item)),
      awards: awards.map((item) => item.award).filter((item): item is string => Boolean(item)),
      species: species.filter((item) => item.speciesCommon).map((item) => ({ common: item.speciesCommon!, latin: item.speciesLatin })),
    };
  }
}

