declare module 'compact-encoding' {
  type Encoding = unknown;
  type EncodedValue = unknown;

  interface CompactEncodingApi {
    any: Encoding;
    frame(encoding: Encoding): Encoding;
    encode(encoding: Encoding, value: EncodedValue): Uint8Array;
    decode(encoding: Encoding, buffer: Uint8Array): EncodedValue;
  }

  const cenc: CompactEncodingApi;
  export default cenc;
}
