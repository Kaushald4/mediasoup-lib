/**
 * Track subscribed message handler
 */

import { BaseHandler } from './BaseHandler';
import type { HandlerContext } from './types';

export class TrackSubscribedHandler extends BaseHandler {
  public readonly type = 'track_subscribed';

  public handle(_context: HandlerContext, message: any): void {
    // This is handled by subscribeToTrack method
    console.log('Track subscribed:', message);
  }
}
