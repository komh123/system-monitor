import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import chatRoutes from './chatRoutes.js';

describe('Chat API - Commands', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/chat', chatRoutes);
  });

  describe('GET /api/chat/commands', () => {
    it('should return list of available slash commands', async () => {
      const res = await request(app)
        .get('/api/chat/commands')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('sessionCommands');
      expect(res.body).toHaveProperty('skills');
      expect(res.body).toHaveProperty('agents');

      // Verify session commands
      expect(res.body.sessionCommands).toBeInstanceOf(Array);
      expect(res.body.sessionCommands.length).toBeGreaterThan(0);

      const compactCommand = res.body.sessionCommands.find(cmd => cmd.id === 'compact');
      expect(compactCommand).toBeDefined();
      expect(compactCommand).toMatchObject({
        id: 'compact',
        name: '/compact',
        description: 'Compress conversation context',
        category: 'session'
      });

      const costCommand = res.body.sessionCommands.find(cmd => cmd.id === 'cost');
      expect(costCommand).toBeDefined();
      expect(costCommand).toMatchObject({
        id: 'cost',
        name: '/cost',
        description: 'Show API usage costs',
        category: 'session'
      });

      const contextCommand = res.body.sessionCommands.find(cmd => cmd.id === 'context');
      expect(contextCommand).toBeDefined();
      expect(contextCommand).toMatchObject({
        id: 'context',
        name: '/context',
        description: 'Show context window usage',
        category: 'session'
      });

      const clearCommand = res.body.sessionCommands.find(cmd => cmd.id === 'clear');
      expect(clearCommand).toBeDefined();
      expect(clearCommand).toMatchObject({
        id: 'clear',
        name: '/clear',
        description: 'Clear conversation',
        category: 'session'
      });
    });

    it('should return skills array', async () => {
      const res = await request(app)
        .get('/api/chat/commands')
        .expect(200);

      expect(res.body.skills).toBeInstanceOf(Array);
      // Skills can be empty or populated, just verify structure
    });

    it('should return agents array', async () => {
      const res = await request(app)
        .get('/api/chat/commands')
        .expect(200);

      expect(res.body.agents).toBeInstanceOf(Array);
      // Agents can be empty or populated, just verify structure
    });
  });
});
