import { prisma } from '@shared/utils/prismaClient'
import { processMarkdown, validateMarkdown } from '@utils/markdown'
import { indexBlog, updateBlogIndex } from '@utils/elasticsearch'
import { blogCache } from '@shared/config/redis'
import { processImage } from '@config/upload'
import slugify from 'slugify'
import logger from '@shared/utils/logger'

interface CreateBlogInput {
  title: string
  content: string
  description?: string
  categoryId?: string
  tags?: string[]
  published?: boolean
  authorId: string
  file?: Express.Multer.File
}

interface UpdateBlogInput {
  title?: string
  content?: string
  description?: string
  categoryId?: string
  tags?: string[]
  published?: boolean
}

export class BlogService {
  async createBlog(data: CreateBlogInput) {
    const startTime = Date.now();
    logger.debug('Creating new blog post:', { title: data.title, authorId: data.authorId });

    // Validate markdown content
    const validation = validateMarkdown(data.content);
    if (!validation.isValid) {
      logger.error('Invalid markdown content in blog creation');
      throw new Error('Invalid markdown content');
    }

    // Process markdown
    const processedContent = processMarkdown(data.content);

    // Generate slug
    const slug = slugify(data.title, { lower: true, strict: true });

    // Process image if provided
    let imageUrl: string | undefined;
    if (data.file) {
      logger.debug('Processing blog image');
      imageUrl = await processImage(data.file);
    }

    // Create blog post
    logger.debug('Creating blog post in database');
    const blog = await prisma.blog.create({
      data: {
        title: data.title,
        slug,
        content: processedContent,
        description: data.description,
        published: data.published ?? false,
        authorId: data.authorId,
        ...(imageUrl && { imageUrl }),
        ...(data.categoryId && { categoryId: data.categoryId }),
        ...(data.tags && {
          tags: {
            create: data.tags.map(tagName => ({
              tag: {
                connectOrCreate: {
                  where: { name: tagName },
                  create: {
                    name: tagName,
                    slug: slugify(tagName, { lower: true, strict: true }),
                  },
                },
              },
            })),
          },
        }),
        analytics: {
          create: {
            views: 0,
            uniqueViews: 0,
            reads: 0,
          },
        },
      },
      include: {
        category: true,
        tags: {
          include: {
            tag: true,
          },
        },
        analytics: true,
      },
    });

    // Index in Elasticsearch
    logger.debug(`Indexing blog ${blog.id} in Elasticsearch`);
    await indexBlog({
      id: blog.id,
      title: blog.title,
      content: blog.content,
      description: blog.description,
      slug: blog.slug,
      authorId: blog.authorId,
      categoryId: blog.categoryId,
      tags: blog.tags.map(t => t.tag.name),
      published: blog.published,
      createdAt: blog.createdAt,
      updatedAt: blog.updatedAt,
      deletedAt: null,
      views: blog.analytics?.views ?? 0,
    });

    // Cache the blog
    logger.debug(`Caching blog with slug ${slug}`);
    await blogCache.set(slug, JSON.stringify(blog));
    logger.info(`Blog created successfully in ${Date.now() - startTime}ms: ${blog.id}`);

    return blog;
  }

  async getBlogBySlug(slug: string, userId?: string) {
    logger.debug(`Fetching blog by slug: ${slug}`);
    // Try to get from cache first
    const cachedBlog = await blogCache.get(slug);
    if (cachedBlog) {
      const blog = JSON.parse(cachedBlog);
      // Check visibility
      if (!blog.published && !userId) {
        logger.warn(`Unauthorized access attempt for unpublished blog: ${slug}`);
        throw new Error('Blog not found');
      }
      // Increment views in background
      blogCache.incrementViews(blog.id).catch((error: Error) => 
        logger.error('Error incrementing views:', error)
      );
      return blog;
    }

    // If not in cache, get from database
    const blog = await prisma.blog.findUnique({
      where: {
        slug,
        deletedAt: null,
        ...(userId ? {} : { published: true }),
      },
      include: {
        category: true,
        tags: {
          include: {
            tag: true,
          },
        },
        analytics: true,
      },
    });

    if (!blog) {
      logger.warn(`Blog not found with slug: ${slug}`);
      throw new Error('Blog not found');
    }

    // Cache the blog
    await blogCache.set(slug, JSON.stringify(blog));

    // Increment views in background and update Elasticsearch
    logger.debug(`Updating view metrics for blog: ${blog.id}`);
    Promise.all([
      blogCache.incrementViews(blog.id),
      updateBlogIndex(blog.id, { views: (blog.analytics?.views ?? 0) + 1 })
    ]).catch((error: Error) => logger.error('Error updating views:', error));

    return blog;
  }

  async updateBlog(id: string, authorId: string, data: UpdateBlogInput) {
    const startTime = Date.now();
    logger.debug(`Updating blog: ${id}`, { authorId });

    // Check blog exists and user is author
    const blog = await prisma.blog.findUnique({
      where: { id },
      select: {
        authorId: true,
        slug: true,
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (!blog) {
      logger.warn(`Blog not found for update: ${id}`);
      throw new Error('Blog not found');
    }

    if (blog.authorId !== authorId) {
      logger.warn(`Unauthorized blog update attempt for ${id} by ${authorId}`);
      throw new Error('Not authorized');
    }

    // Process content if provided
    let processedContent = undefined;
    if (data.content) {
      const validation = validateMarkdown(data.content);
      if (!validation.isValid) {
        logger.error('Invalid markdown content in blog update');
        throw new Error('Invalid markdown content');
      }
      processedContent = processMarkdown(data.content);
    }

    // Update blog
    const updatedBlog = await prisma.blog.update({
      where: { id },
      data: {
        ...(data.title && {
          title: data.title,
          slug: slugify(data.title, { lower: true, strict: true }),
        }),
        ...(processedContent && { content: processedContent }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.published !== undefined && { published: data.published }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.tags && {
          tags: {
            deleteMany: {},
            create: data.tags.map(tagName => ({
              tag: {
                connectOrCreate: {
                  where: { name: tagName },
                  create: {
                    name: tagName,
                    slug: slugify(tagName, { lower: true, strict: true }),
                  },
                },
              },
            })),
          },
        }),
      },
      include: {
        category: true,
        tags: {
          include: {
            tag: true,
          },
        },
        analytics: true,
      },
    });

    // Update Elasticsearch
    logger.debug(`Updating blog ${id} in Elasticsearch`);
    await updateBlogIndex(id, {
      title: updatedBlog.title,
      content: updatedBlog.content,
      description: updatedBlog.description,
      slug: updatedBlog.slug,
      categoryId: updatedBlog.categoryId,
      tags: updatedBlog.tags.map(t => t.tag.name),
      published: updatedBlog.published,
      updatedAt: updatedBlog.updatedAt,
    });

    // Invalidate old cache and cache updated blog
    logger.debug(`Updating cache for blog ${id}`);
    await Promise.all([
      blogCache.invalidate(blog.slug),
      data.title ? blogCache.invalidate(slugify(data.title, { lower: true, strict: true })) : null,
      blogCache.set(updatedBlog.slug, JSON.stringify(updatedBlog)),
    ]);

    logger.info(`Blog updated successfully in ${Date.now() - startTime}ms: ${id}`);
    return updatedBlog;
  }

  async deleteBlog(id: string, authorId: string) {
    logger.debug(`Attempting to delete blog: ${id}`, { authorId });

    // Check blog exists and user is author
    const blog = await prisma.blog.findUnique({
      where: { id },
      select: { authorId: true, slug: true }
    });

    if (!blog) {
      logger.warn(`Blog not found for deletion: ${id}`);
      throw new Error('Blog not found');
    }

    if (blog.authorId !== authorId) {
      logger.warn(`Unauthorized blog deletion attempt for ${id} by ${authorId}`);
      throw new Error('Not authorized');
    }

    logger.debug(`Soft deleting blog ${id} and cleaning up references`);
    await Promise.all([
      prisma.blog.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      blogCache.invalidate(blog.slug),
      updateBlogIndex(id, { deletedAt: new Date() })
    ]);

    logger.info(`Blog deleted successfully: ${id}`);
  }
}
