import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'GitHub Clone Backend API',
      version: '1.0.0',
      description: 'A GitHub clone backend API with authentication, repositories, followers, and more',
      contact: {
        name: 'GitHub Clone Team',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000/api',
        description: 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        tokenAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-auth-token',
        },
      },
    },
  },
  apis: ['./routes/*.js'],
};

export default swaggerJsdoc(options);
