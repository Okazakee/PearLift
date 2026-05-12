export declare function decodeBase64(
  base64: string,
  config?: ScanConfig,
): Promise<Result[]>;
export interface ScanConfig {
  multiple?: boolean;
}
export interface Result {
  barcodeText: string;
  barcodeFormat: string;
  barcodeBytesBase64: string;
  points: {
    x: number;
    y: number;
  }[];
}
//# sourceMappingURL=index.d.ts.map
