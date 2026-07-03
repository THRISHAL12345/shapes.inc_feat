import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

export * from './db';
export * from './services';
export * from './api';
import { negotiateRouter } from './api';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/negotiate', negotiateRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'negotiate-orchestrator' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`[negotiate] Backend listening on port ${port}`);
  });
}

export default app;
