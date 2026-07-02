import { Request, Response } from 'express'
import { z } from 'zod'
import logger from '@shared/utils/logger'
import { CategoryService } from '@services/category.service'

const createCategorySchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(1000).optional(),
  parentId: z.string().optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(7).optional(),
  sortOrder: z.number().int().optional(),
})

const updateCategorySchema = createCategorySchema.partial()

export class CategoryController {
  private readonly categoryService: CategoryService

  constructor() {
    this.categoryService = new CategoryService()
  }

  // Public list of visible categories, one level of children nested
  async list(req: Request, res: Response): Promise<Response> {
    try {
      const categories = await this.categoryService.listCategories();
      return res.json(categories)
    } catch (error) {
      logger.error('Error listing categories:', error)
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch categories due to an unexpected error'
      })
    }
  }

  // Create a category (admin only)
  async create(req: Request, res: Response): Promise<Response> {
    try {
      const input = createCategorySchema.parse(req.body)
      const category = await this.categoryService.createCategory(input);
      return res.status(201).json(category)
    } catch (error) {
      logger.error('Error creating category:', error)

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }

      if (error instanceof Error && error.message === 'Category slug already exists') {
        return res.status(400).json({
          message: 'Category already exists',
          details: 'A category with this name already exists'
        })
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to create category due to an unexpected error'
      })
    }
  }

  // Update a category (admin only)
  async update(req: Request, res: Response): Promise<Response> {
    const { id } = req.params
    if (!id) {
      return res.status(400).json({
        message: 'Category ID is required',
        details: 'The category ID parameter is missing from the request URL'
      });
    }

    try {
      const input = updateCategorySchema.parse(req.body)
      const category = await this.categoryService.updateCategory(id, input);
      return res.json(category)
    } catch (error) {
      logger.error('Error updating category:', error)

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }

      if (error instanceof Error) {
        switch (error.message) {
          case 'Category not found':
            return res.status(404).json({
              message: 'Category not found',
              details: 'The specified category does not exist'
            })
          case 'Category slug already exists':
            return res.status(400).json({
              message: 'Category already exists',
              details: 'A category with this name already exists'
            })
        }
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to update category due to an unexpected error'
      })
    }
  }

  // Delete a category (admin only) - blocked if in use
  async delete(req: Request, res: Response): Promise<Response> {
    const { id } = req.params
    if (!id) {
      return res.status(400).json({
        message: 'Category ID is required',
        details: 'The category ID parameter is missing from the request URL'
      });
    }

    try {
      await this.categoryService.deleteCategory(id);
      return res.json({ message: 'Category deleted successfully' })
    } catch (error) {
      logger.error('Error deleting category:', error)

      if (error instanceof Error) {
        switch (error.message) {
          case 'Category not found':
            return res.status(404).json({
              message: 'Category not found',
              details: 'The specified category does not exist'
            })
          case 'Category is in use':
            return res.status(409).json({
              message: 'Category is in use',
              details: 'This category has blogs or child categories referencing it and cannot be deleted'
            })
        }
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to delete category due to an unexpected error'
      })
    }
  }
}
