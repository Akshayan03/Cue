// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom doesn't ship TextEncoder/TextDecoder, which react-router v7 needs.
import { TextDecoder, TextEncoder } from 'util';
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
  globalThis.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;
}
