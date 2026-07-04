import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

export * from './db';
export * from './services';
export * from './api';
import { negotiateRouter, createNegotiationRouter } from './api';
import { initializeStorage } from './db';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

let activeRouter = negotiateRouter;
app.use('/api/negotiate', (req, res, next) => {
  activeRouter(req, res, next);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'negotiate-orchestrator' });
});

if (process.env.NODE_ENV !== 'test') {
  initializeStorage()
    .then(() => {
      activeRouter = createNegotiationRouter();
      app.listen(port, () => {
        console.log(`[negotiate] Backend listening on port ${port}`);
      });
    })
    .catch((err) => {
      console.error('[negotiate] Failed to initialize storage:', err);
      app.listen(port, () => {
        console.log(`[negotiate] Backend listening on port ${port} (fallback storage)`);
      });
    });
}

export default app;
