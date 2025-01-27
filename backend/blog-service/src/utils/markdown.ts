import MarkdownIt from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import markdownItHighlightjs from 'markdown-it-highlightjs'
import sanitizeHtml from 'sanitize-html'
import logger from '@shared/utils/logger'

// Initialize markdown parser with plugins
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
})
  .use(markdownItAnchor, {
    permalink: true,
    permalinkSymbol: '#',
    permalinkSpace: false,
  })
  .use(markdownItHighlightjs, {
    inline: true,
  })

// Sanitization options
const sanitizeOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'strong', 'em', 'del',
    'blockquote', 'code', 'pre',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span',
  ],
  allowedAttributes: {
    'a': ['href', 'title', 'target'],
    'img': ['src', 'alt', 'title'],
    'code': ['class'],
    'pre': ['class'],
    'div': ['class'],
    'span': ['class'],
    'th': ['align'],
    'td': ['align'],
  },
  allowedSchemes: ['http', 'https', 'ftp', 'mailto'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
  },
}

// Process markdown content
export const processMarkdown = (content: string): string => {
  try {
    // Convert markdown to HTML
    const htmlContent = md.render(content)

    // Sanitize HTML
    const sanitizedContent = sanitizeHtml(htmlContent, sanitizeOptions)

    return sanitizedContent
  } catch (error) {
    logger.error('Error processing markdown:', error)
    throw error
  }
}

// Extract metadata from markdown content
export const extractMetadata = (content: string) => {
  try {
    const titleRegex = /^#\s+(.+)$/m
    const titleMatch = titleRegex.exec(content)
    const title = titleMatch ? titleMatch[1].trim() : ''

    const descriptionRegex = /^>\s*(.+?)\s*$/m
    const descriptionMatch = descriptionRegex.exec(content)
    const description = descriptionMatch ? descriptionMatch[1].trim() : ''

    // Extract all image URLs
    const imagePattern = /!\[.*?\]\((.*?)\)/g
    const images: string[] = []
    let match
    while ((match = imagePattern.exec(content)) !== null) {
      images.push(match[1])
    }

    // Extract code block languages
    const codeBlockPattern = /```(\w+)/g
    const codeLanguages = new Set<string>()
    while ((match = codeBlockPattern.exec(content)) !== null) {
      if (match[1] !== '') {
        codeLanguages.add(match[1])
      }
    }

    return {
      title,
      description,
      images,
      codeLanguages: Array.from(codeLanguages),
    }
  } catch (error) {
    logger.error('Error extracting metadata:', error)
    throw error
  }
}

// Generate table of contents from markdown
export const generateTOC = (content: string) => {
  try {
    const headingPattern = /^(#{1,6})\s+(.+)$/gm
    const toc: Array<{ level: number; text: string; slug: string }> = []
    let match

    while ((match = headingPattern.exec(content)) !== null) {
      const level = match[1].length
      const text = match[2].trim()
      const slug = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')

      toc.push({ level, text, slug })
    }

    return toc
  } catch (error) {
    logger.error('Error generating TOC:', error)
    throw error
  }
}

// Validate markdown content
export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

export const validateMarkdown = (content: string): ValidationResult => {
  const errors: string[] = []

  try {
    // Check minimum length
    if (content.length < 100) {
      errors.push('Content is too short (minimum 100 characters)')
    }

    // Check for title 
        const titleRegex = /^#\s+.+$/m
        if (!titleRegex.exec(content)) {
          errors.push('Missing title (should start with # )')
        }

    // Check for broken image links
        const imageLinks = content.match(/!\[.*?\]\((.*?)\)/g) || []
        imageLinks.forEach(link => {
          const linkRegex = /!\[.*?\]\((.*?)\)/;
          const matchResult = linkRegex.exec(link);
          const url = matchResult ? matchResult[1] : '';
          if (!/^(http|https|\/)/.exec(url)) {
            errors.push(`Invalid image URL: ${url}`)
          }
        })

    // Check for broken code blocks
    const codeBlocks = content.match(/```[\s\S]*?```/g) || []
    codeBlocks.forEach(block => {
      const codeBlockRegex = /```\w*\n[\s\S]*?\n```/
      if (!codeBlockRegex.exec(block)) {
        errors.push('Malformed code block')
      }
    })

    return {
      isValid: errors.length === 0,
      errors
    }
  } catch (error) {
    logger.error('Error validating markdown:', error)
    return {
      isValid: false,
      errors: ['Invalid markdown syntax']
    }
  }
}
