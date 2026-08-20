/**
 * Unified output/feedback interface pins (prompt-consistency-metrics,
 * card 5) — one canonical emission path over the DeliveryContext
 * channels: notify (operator line), mark (persistent record), compliance
 * (line + record). Fail-open: a throwing delivery never throws.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';
import { createFeedbackChannel, NOOP_DELIVERY, type DeliveryContextService } from '../src/index.js';

interface DeliverySpy {
  delivery: DeliveryContextService;
  notified: string[];
  entries: Array<{ channel: string; payload: unknown }>;
}

function stubDelivery(): DeliverySpy {
  const notified: string[] = [];
  const entries: Array<{ channel: string; payload: unknown }> = [];
  return {
    notified,
    entries,
    delivery: {
      notify: (text: string) => {
        notified.push(text);
      },
      appendEntry: (channel: string, payload: unknown) => {
        entries.push({ channel, payload });
      },
      mutate: () => undefined,
    },
  };
}

describe('unified output/feedback interface — createFeedbackChannel', () => {
  it('notify kind routes to the notify channel only', () => {
    const spy = stubDelivery();
    const channel = createFeedbackChannel(spy.delivery);
    channel.emit({ kind: 'notify', text: 'settlement line' });
    expect(spy.notified).toEqual(['settlement line']);
    expect(spy.entries).toEqual([]);
  });

  it('mark kind routes to appendEntry (feedback channel), no notify', () => {
    const spy = stubDelivery();
    const channel = createFeedbackChannel(spy.delivery);
    channel.emit({ kind: 'mark', text: 'persistent mark', payload: { id: 1 } });
    expect(spy.notified).toEqual([]);
    expect(spy.entries).toEqual([{ channel: 'feedback', payload: { text: 'persistent mark', id: 1 } }]);
  });

  it('compliance kind notifies AND records a compliance entry', () => {
    const spy = stubDelivery();
    const channel = createFeedbackChannel(spy.delivery);
    channel.emit({ kind: 'compliance', text: 'observed: rtk prefix', payload: { rule: 'rtk', observed: true } });
    expect(spy.notified).toEqual(['observed: rtk prefix']);
    expect(spy.entries).toEqual([
      {
        channel: 'feedback',
        payload: { kind: 'compliance', text: 'observed: rtk prefix', rule: 'rtk', observed: true },
      },
    ]);
  });

  it('a bare notify line emits the text only (payload is not applicable to notify)', () => {
    const spy = stubDelivery();
    const channel = createFeedbackChannel(spy.delivery);
    channel.emit({ kind: 'notify', text: 'bare line' });
    expect(spy.notified).toEqual(['bare line']);
    expect(spy.entries).toEqual([]);
  });

  it('fail-open: a throwing delivery never throws into the loop', () => {
    const throwing: DeliveryContextService = {
      notify: () => {
        throw new Error('delivery down');
      },
      appendEntry: () => {
        throw new Error('delivery down');
      },
      mutate: () => undefined,
    };
    const channel = createFeedbackChannel(throwing);
    expect(() => channel.emit({ kind: 'compliance', text: 'x' })).not.toThrow();
    expect(() => channel.emit({ kind: 'notify', text: 'x' })).not.toThrow();
  });

  it('NOOP_DELIVERY is a safe transport (no-op, no throw)', () => {
    const channel = createFeedbackChannel(NOOP_DELIVERY);
    expect(() => channel.emit({ kind: 'compliance', text: 'x', payload: { rule: 'r' } })).not.toThrow();
  });
});
