/**
 * Callable JS and runtime globals: a call to one the file neither binds nor imports is no hole in the project.
 * A fixed list, never read off `globalThis`, so Bun and Node index alike; member-only globals (`JSON`, `Math`,
 * `console`) are left out, since a member call makes no `calls` edge.
 */
export const JS_GLOBALS: ReadonlySet<string> = new Set([
  // ECMAScript functions
  "decodeURI", "decodeURIComponent", "encodeURI", "encodeURIComponent", "escape", "eval", "isFinite", "isNaN",
  "parseFloat", "parseInt", "unescape",
  // ECMAScript constructors and conversions
  "AggregateError", "Array", "ArrayBuffer", "BigInt", "BigInt64Array", "BigUint64Array", "Boolean", "DataView", "Date",
  "Error", "EvalError", "FinalizationRegistry", "Float32Array", "Float64Array", "Function", "Int16Array", "Int32Array",
  "Int8Array", "Map", "Number", "Object", "Promise", "Proxy", "RangeError", "ReferenceError", "RegExp", "Set",
  "SharedArrayBuffer", "String", "Symbol", "SyntaxError", "TypeError", "URIError", "Uint16Array", "Uint32Array",
  "Uint8Array", "Uint8ClampedArray", "WeakMap", "WeakRef", "WeakSet",
  // Web and runtime globals Node and Bun share
  "AbortController", "AbortSignal", "Blob", "BroadcastChannel", "Buffer", "CustomEvent", "DOMException", "Event",
  "EventTarget", "File", "FormData", "Headers", "MessageChannel", "ReadableStream", "Request", "Response",
  "TextDecoder", "TextEncoder", "TransformStream", "URL", "URLSearchParams", "WebSocket", "WritableStream",
  "atob", "btoa", "clearImmediate", "clearInterval", "clearTimeout", "fetch", "queueMicrotask", "require",
  "setImmediate", "setInterval", "setTimeout", "structuredClone",
]);
