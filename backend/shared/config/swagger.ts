import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Man Kahi Blogging System API',
      version: '1.0.0',
      description: 'API documentation for Man Kahi Blogging System microservices',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.mankahi.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{
      bearerAuth: [],
    }],
  },
  apis: [], // This will be populated by each service
};

export function setupSwagger(app: Express, serviceName: string, routesPath: string[]) {
  // Update the API paths for this specific service
  options.apis = routesPath;
  
  const specs = swaggerJsdoc(options) as swaggerJsdoc.SwaggerDefinition;
  
  // Add service name to the documentation
  if (specs.info) {
    specs.info.title = `${specs.info.title} - ${serviceName}`;
  }
  
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
}

export const swaggerOptions = options;
