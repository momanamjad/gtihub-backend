process.env.VERCEL = '1';

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = import('../index.js').then((m) => m.default);
  }
  return appPromise;
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error) {
    console.error('Serverless Function Initialization Error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(
      JSON.stringify({
        error: 'SERVERLESS_FUNCTION_ERROR',
        message: error.message,
        stack: error.stack,
      })
    );
  }
}

