import type { Widgets } from 'blessed';

import { describe, expect, it } from 'vitest';

import { normalizeBlessedKeypress } from '@engine/chat/keys';

/**
 * Creates one lightweight key event fixture for key-normalization tests.
 */
function createKey(
  args: Partial<Widgets.Events.IKeyEventArg>,
): Widgets.Events.IKeyEventArg {
  return {
    name: '',
    ctrl: false,
    meta: false,
    shift: false,
    full: '',
    sequence: '',
    ...args,
  };
}

describe('chat key normalization', () => {
  it('normalizes ctrl+letter bindings', () => {
    expect(normalizeBlessedKeypress({ ch: '', key: createKey({ ctrl: true, name: 'r' }) }).binding).toBe('ctrl+r');
  });

  it('normalizes ctrl+enter using ctrl+m sequence', () => {
    expect(normalizeBlessedKeypress({ ch: '', key: createKey({ ctrl: true, name: 'm' }) }).binding).toBe('ctrl+enter');
  });

  it('normalizes ctrl+enter when terminal reports key name enter', () => {
    expect(normalizeBlessedKeypress({ ch: '', key: createKey({ ctrl: true, name: 'enter' }) }).binding).toBe('ctrl+enter');
  });

  it('normalizes ctrl+enter when terminal reports ctrl+j', () => {
    expect(normalizeBlessedKeypress({ ch: '', key: createKey({ ctrl: true, name: 'j' }) }).binding).toBe('ctrl+enter');
  });

  it('normalizes ctrl+enter when terminal reports full C-j sequence', () => {
    expect(normalizeBlessedKeypress({ ch: '', key: createKey({ full: 'C-j' }) }).binding).toBe('ctrl+enter');
  });

  it('normalizes ctrl+enter when terminal reports linefeed key name', () => {
    expect(normalizeBlessedKeypress({ ch: '', key: createKey({ name: 'linefeed' }) }).binding).toBe('ctrl+enter');
  });

  it('maps alt+enter to meta+enter binding', () => {
    expect(normalizeBlessedKeypress({ ch: '', key: createKey({ meta: true, name: 'enter' }) }).binding).toBe('meta+enter');
  });

  it('normalizes spacebar as space binding with printable text', () => {
    expect(normalizeBlessedKeypress({ ch: ' ', key: createKey({ name: 'space' }) })).toMatchObject({
      binding: 'space',
      printableText: ' ',
    });
  });

  it('normalizes escape key to esc binding', () => {
    expect(normalizeBlessedKeypress({ ch: '', key: createKey({ name: 'escape' }) }).binding).toBe('esc');
  });

  it('normalizes backspace key to backspace binding', () => {
    expect(normalizeBlessedKeypress({ ch: '', key: createKey({ name: 'backspace' }) }).binding).toBe('backspace');
  });

  it('normalizes return key name to enter binding', () => {
    expect(normalizeBlessedKeypress({ ch: '', key: createKey({ name: 'return', full: 'return' }) }).binding).toBe('enter');
  });

  it('exposes printable text for plain character input', () => {
    expect(normalizeBlessedKeypress({ ch: 'h', key: createKey({ name: 'h' }) }).printableText).toBe('h');
  });
});
