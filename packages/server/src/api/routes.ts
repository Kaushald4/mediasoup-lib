/**
 * API routes for token generation
 */

import express from 'express';
import { AccessToken } from '../auth';
import type { JwtConfig } from '../config';

const router: any = express.Router();

/**
 * POST /api/token - Generate access token
 */
router.post('/token', (req: any, res: any) => {
  try {
    const { identity, name, room, metadata, canPublish, canSubscribe, canPublishData } = req.body;

    if (!identity) {
      return res.status(400).json({ error: 'identity is required' });
    }

    const jwtConfig = req.app.get('jwtConfig') as JwtConfig;
    const token = new AccessToken(jwtConfig.apiKey, jwtConfig.apiSecret, identity);

    if (name) token.setName(name);
    if (metadata) token.setMetadata(metadata);

    token.addGrant({
      room,
      roomJoin: true,
      canPublish: canPublish ?? true,
      canSubscribe: canSubscribe ?? true,
      canPublishData: canPublishData ?? true,
    });

    token.setValidity(24 * 60 * 60); // 24 hours

    token.toJwt();

    return res.json({ token });
  } catch (error) {
    console.error('Error generating token:', error);
    return res.status(500).json({ error: 'Failed to generate token' });
  }
});

/**
 * GET /api/health - Health check
 */
router.get('/health', (_req: any, res: any) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

export default router;
