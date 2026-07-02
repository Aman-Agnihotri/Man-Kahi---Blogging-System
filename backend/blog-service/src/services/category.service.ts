import { prisma } from '@shared/utils/prismaClient'
import slugify from 'slugify'
import logger from '@shared/utils/logger'

interface CategoryInput {
  name?: string
  description?: string
  parentId?: string
  icon?: string
  color?: string
  sortOrder?: number
}

export class CategoryService {
  // Returns top-level (non-hidden) categories with their immediate children
  // nested one level, matching the schema's actual hierarchy depth in
  // practice (Category.parent/children is only ever used two levels deep).
  // Hidden child categories are also excluded from the nested list.
  async listCategories() {
    logger.debug('Listing categories')
    return prisma.category.findMany({
      where: { isHidden: false, parentId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        children: {
          where: { isHidden: false },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    })
  }

  async createCategory(input: {
    name: string
    description?: string
    parentId?: string
    icon?: string
    color?: string
    sortOrder?: number
  }) {
    logger.debug('Creating category', { name: input.name })

    const slug = slugify(input.name, { lower: true, strict: true })
    const existing = await prisma.category.findUnique({ where: { slug } })
    if (existing) {
      throw new Error('Category slug already exists')
    }

    return prisma.category.create({
      data: {
        name: input.name,
        slug,
        description: input.description,
        parentId: input.parentId,
        icon: input.icon,
        color: input.color,
        sortOrder: input.sortOrder ?? 0,
      },
    })
  }

  async updateCategory(id: string, input: CategoryInput) {
    logger.debug(`Updating category ${id}`);

    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) {
      throw new Error('Category not found')
    }

    let slug: string | undefined
    if (input.name && input.name !== existing.name) {
      slug = slugify(input.name, { lower: true, strict: true })
      const slugConflict = await prisma.category.findFirst({
        where: { slug, id: { not: id } },
      })
      if (slugConflict) {
        throw new Error('Category slug already exists')
      }
    }

    return prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(slug && { slug }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.parentId !== undefined && { parentId: input.parentId }),
        ...(input.icon !== undefined && { icon: input.icon }),
        ...(input.color !== undefined && { color: input.color }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
    })
  }

  async deleteCategory(id: string) {
    logger.debug(`Deleting category ${id}`);

    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) {
      throw new Error('Category not found')
    }

    const [blogCount, childCount] = await Promise.all([
      prisma.blog.count({ where: { categoryId: id, deletedAt: null } }),
      prisma.category.count({ where: { parentId: id } }),
    ])

    if (blogCount > 0 || childCount > 0) {
      throw new Error('Category is in use')
    }

    await prisma.category.delete({ where: { id } })
    return { id }
  }
}
