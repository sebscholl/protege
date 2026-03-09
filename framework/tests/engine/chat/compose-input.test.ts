import { beforeAll, describe, expect, it } from 'vitest';

import {
  applyComposeInputBinding,
  createComposeInputState,
  escapeComposeText,
  renderComposeInput,
} from '@engine/chat/compose-input';

let insertedText = '';
let insertedCursorIndex = -1;
let movedLeftCursorIndex = -1;
let movedRightCursorIndex = -1;
let homeCursorIndex = -1;
let endCursorIndex = -1;
let backspaceText = '';
let backspaceCursorIndex = -1;
let deleteText = '';
let deleteCursorIndex = -1;
let renderedCompose = '';
let renderedComposeCursorHidden = '';
let renderedComposeEndCursor = '';
let renderedReadOnly = '';
let escapedComposeText = '';

beforeAll((): void => {
  const base = createComposeInputState({
    draft: 'hello',
  });
  const inserted = applyComposeInputBinding({
    state: base,
    binding: 'x',
    printableText: '!',
  });
  insertedText = inserted.state.text;
  insertedCursorIndex = inserted.state.cursorIndex;

  const movedLeft = applyComposeInputBinding({
    state: base,
    binding: 'left',
  });
  movedLeftCursorIndex = movedLeft.state.cursorIndex;

  const movedRight = applyComposeInputBinding({
    state: {
      text: 'hello',
      cursorIndex: 2,
    },
    binding: 'right',
  });
  movedRightCursorIndex = movedRight.state.cursorIndex;

  const movedHome = applyComposeInputBinding({
    state: base,
    binding: 'home',
  });
  homeCursorIndex = movedHome.state.cursorIndex;

  const movedEnd = applyComposeInputBinding({
    state: {
      text: 'hello',
      cursorIndex: 0,
    },
    binding: 'end',
  });
  endCursorIndex = movedEnd.state.cursorIndex;

  const backspace = applyComposeInputBinding({
    state: {
      text: 'hello',
      cursorIndex: 3,
    },
    binding: 'backspace',
  });
  backspaceText = backspace.state.text;
  backspaceCursorIndex = backspace.state.cursorIndex;

  const del = applyComposeInputBinding({
    state: {
      text: 'hello',
      cursorIndex: 1,
    },
    binding: 'delete',
  });
  deleteText = del.state.text;
  deleteCursorIndex = del.state.cursorIndex;

  renderedCompose = renderComposeInput({
    state: {
      text: 'hello',
      cursorIndex: 2,
    },
    isReadOnly: false,
    cursorVisible: true,
  });
  renderedComposeCursorHidden = renderComposeInput({
    state: {
      text: 'hello',
      cursorIndex: 2,
    },
    isReadOnly: false,
    cursorVisible: false,
  });
  renderedComposeEndCursor = renderComposeInput({
    state: {
      text: 'hello',
      cursorIndex: 5,
    },
    isReadOnly: false,
    cursorVisible: true,
  });
  renderedReadOnly = renderComposeInput({
    state: {
      text: 'hello',
      cursorIndex: 2,
    },
    isReadOnly: true,
    cursorVisible: true,
  });
  escapedComposeText = escapeComposeText({
    value: '{hello}\\',
  });
});

describe('compose input behavior', () => {
  it('inserts printable text at cursor', () => {
    expect(insertedText).toBe('hello!');
  });

  it('advances cursor after insertion', () => {
    expect(insertedCursorIndex).toBe(6);
  });

  it('moves cursor left by one', () => {
    expect(movedLeftCursorIndex).toBe(4);
  });

  it('moves cursor right by one', () => {
    expect(movedRightCursorIndex).toBe(3);
  });

  it('moves cursor home', () => {
    expect(homeCursorIndex).toBe(0);
  });

  it('moves cursor end', () => {
    expect(endCursorIndex).toBe(5);
  });

  it('backspace removes prior character', () => {
    expect(backspaceText).toBe('helo');
  });

  it('backspace moves cursor left', () => {
    expect(backspaceCursorIndex).toBe(2);
  });

  it('delete removes character at cursor', () => {
    expect(deleteText).toBe('hllo');
  });

  it('delete keeps cursor index stable', () => {
    expect(deleteCursorIndex).toBe(1);
  });

  it('renders prompt prefix for writable compose input', () => {
    expect(renderedCompose.startsWith('> ')).toBe(true);
  });

  it('renders inverse-highlight cursor on current character', () => {
    expect(renderedCompose).toBe('> he{inverse}l{/inverse}lo');
  });

  it('hides cursor decoration when blink state is off', () => {
    expect(renderedComposeCursorHidden).toBe('> hello');
  });

  it('renders underscore cursor at end-of-line', () => {
    expect(renderedComposeEndCursor).toBe('> hello{underline}_{/underline}');
  });

  it('renders read-only placeholder when compose is disabled', () => {
    expect(renderedReadOnly).toBe('[read-only]');
  });

  it('escapes braces and backslashes for blessed tag-safe rendering', () => {
    expect(escapedComposeText).toBe('\\{hello\\}\\\\');
  });
});
