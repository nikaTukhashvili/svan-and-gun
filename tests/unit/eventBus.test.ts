import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/eventBus';
import type { GameEvents } from '../../src/core/events';

describe('EventBus', () => {
  it('delivers payloads to listeners', () => {
    const bus = new EventBus<GameEvents>();
    const fn = vi.fn();
    bus.on('player:levelUp', fn);
    bus.emit('player:levelUp', { level: 2 });
    expect(fn).toHaveBeenCalledWith({ level: 2 });
  });

  it('stops delivering after off() or the returned unsubscribe', () => {
    const bus = new EventBus<GameEvents>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('player:levelUp', a);
    const unsubscribe = bus.on('player:levelUp', b);
    bus.off('player:levelUp', a);
    unsubscribe();
    bus.emit('player:levelUp', { level: 3 });
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('once() fires a single time', () => {
    const bus = new EventBus<GameEvents>();
    const fn = vi.fn();
    bus.once('run:ended', fn);
    bus.emit('run:ended', { result: 'victory' });
    bus.emit('run:ended', { result: 'defeat' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('lets a listener unsubscribe during dispatch without skipping others', () => {
    const bus = new EventBus<GameEvents>();
    const second = vi.fn();
    const first = () => bus.off('player:levelUp', first);
    bus.on('player:levelUp', first);
    bus.on('player:levelUp', second);
    bus.emit('player:levelUp', { level: 2 });
    expect(second).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('player:levelUp')).toBe(1);
  });

  it('clear() removes every listener (end of run)', () => {
    const bus = new EventBus<GameEvents>();
    bus.on('player:levelUp', vi.fn());
    bus.on('run:ended', vi.fn());
    bus.clear();
    expect(bus.listenerCount('player:levelUp')).toBe(0);
    expect(bus.listenerCount('run:ended')).toBe(0);
  });
});
