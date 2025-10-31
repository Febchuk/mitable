import { coordinateConverter } from "../coordinate-converter.service";

describe("CoordinateConverterService", () => {
  const imageDimensions = { width: 1920, height: 1080 };

  describe("convertToPixels", () => {
    test("converts normalized coordinates to pixels", () => {
      const normalized = { x: 0.5, y: 0.5, width: 0.1, height: 0.05 };
      const result = coordinateConverter.convertToPixels(normalized, imageDimensions);

      expect(result).toEqual({
        x: 960, // 50% of 1920
        y: 540, // 50% of 1080
        width: 192, // 10% of 1920
        height: 54, // 5% of 1080
      });
    });

    test("handles coordinates at image edges", () => {
      const atTopLeft = { x: 0.0, y: 0.0, width: 0.1, height: 0.1 };
      const result = coordinateConverter.convertToPixels(atTopLeft, imageDimensions);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.width).toBe(192); // 10% of 1920
      expect(result.height).toBe(108); // 10% of 1080
    });

    test("handles already-pixel coordinates", () => {
      const pixels = { x: 100, y: 200, width: 300, height: 50 };
      const result = coordinateConverter.convertToPixels(pixels, imageDimensions);

      expect(result).toEqual(pixels);
    });

    test("clamps out-of-bounds coordinates to image bounds", () => {
      const outOfBounds = { x: -10, y: -5, width: 2000, height: 1200 };
      const result = coordinateConverter.convertToPixels(outOfBounds, imageDimensions);

      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeGreaterThanOrEqual(0);
      expect(result.x + result.width).toBeLessThanOrEqual(imageDimensions.width);
      expect(result.y + result.height).toBeLessThanOrEqual(imageDimensions.height);
    });

    test("clamps coordinates that exceed right edge", () => {
      const exceedsRight = { x: 1800, y: 100, width: 300, height: 50 };
      const result = coordinateConverter.convertToPixels(exceedsRight, imageDimensions);

      expect(result.x).toBe(1800);
      expect(result.y).toBe(100);
      expect(result.width).toBe(120); // Clamped to fit within 1920
      expect(result.height).toBe(50);
    });

    test("clamps coordinates that exceed bottom edge", () => {
      const exceedsBottom = { x: 100, y: 1000, width: 200, height: 200 };
      const result = coordinateConverter.convertToPixels(exceedsBottom, imageDimensions);

      expect(result.x).toBe(100);
      expect(result.y).toBe(1000);
      expect(result.width).toBe(200);
      expect(result.height).toBe(80); // Clamped to fit within 1080
    });

    test("handles very small normalized coordinates", () => {
      const tiny = { x: 0.001, y: 0.001, width: 0.01, height: 0.01 };
      const result = coordinateConverter.convertToPixels(tiny, imageDimensions);

      expect(result.x).toBeCloseTo(1.92, 1);
      expect(result.y).toBeCloseTo(1.08, 1);
      expect(result.width).toBeCloseTo(19.2, 1);
      expect(result.height).toBeCloseTo(10.8, 1);
    });

    test("handles different image dimensions", () => {
      const smallScreen = { width: 1280, height: 720 };
      const normalized = { x: 0.5, y: 0.5, width: 0.2, height: 0.1 };
      const result = coordinateConverter.convertToPixels(normalized, smallScreen);

      expect(result).toEqual({
        x: 640, // 50% of 1280
        y: 360, // 50% of 720
        width: 256, // 20% of 1280
        height: 72, // 10% of 720
      });
    });

    test("handles 4K resolution", () => {
      const fourK = { width: 3840, height: 2160 };
      const normalized = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
      const result = coordinateConverter.convertToPixels(normalized, fourK);

      expect(result).toEqual({
        x: 960, // 25% of 3840
        y: 540, // 25% of 2160
        width: 1920, // 50% of 3840
        height: 1080, // 50% of 2160
      });
    });
  });

  describe("convertMultipleToPixels", () => {
    test("converts array of bounding boxes", () => {
      const boxes = [
        { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
        { x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
        { x: 0.8, y: 0.8, width: 0.1, height: 0.1 },
      ];

      const results = coordinateConverter.convertMultipleToPixels(boxes, imageDimensions);

      expect(results).toHaveLength(3);
      expect(results[0].x).toBe(192); // 10% of 1920
      expect(results[1].x).toBe(960); // 50% of 1920
      expect(results[2].x).toBe(1536); // 80% of 1920
    });

    test("handles empty array", () => {
      const results = coordinateConverter.convertMultipleToPixels([], imageDimensions);
      expect(results).toEqual([]);
    });
  });

  describe("validateBounds", () => {
    test("validates box within bounds", () => {
      const validBox = { x: 100, y: 100, width: 200, height: 150 };
      expect(coordinateConverter.validateBounds(validBox, imageDimensions)).toBe(true);
    });

    test("rejects box with negative coordinates", () => {
      const invalidBox = { x: -10, y: 100, width: 200, height: 150 };
      expect(coordinateConverter.validateBounds(invalidBox, imageDimensions)).toBe(false);
    });

    test("rejects box exceeding right edge", () => {
      const invalidBox = { x: 1800, y: 100, width: 200, height: 150 };
      expect(coordinateConverter.validateBounds(invalidBox, imageDimensions)).toBe(false);
    });

    test("rejects box exceeding bottom edge", () => {
      const invalidBox = { x: 100, y: 1000, width: 200, height: 150 };
      expect(coordinateConverter.validateBounds(invalidBox, imageDimensions)).toBe(false);
    });

    test("rejects box with zero width", () => {
      const invalidBox = { x: 100, y: 100, width: 0, height: 150 };
      expect(coordinateConverter.validateBounds(invalidBox, imageDimensions)).toBe(false);
    });

    test("rejects box with negative dimensions", () => {
      const invalidBox = { x: 100, y: 100, width: -50, height: 150 };
      expect(coordinateConverter.validateBounds(invalidBox, imageDimensions)).toBe(false);
    });

    test("validates box at exact image boundary", () => {
      const edgeBox = { x: 0, y: 0, width: 1920, height: 1080 };
      expect(coordinateConverter.validateBounds(edgeBox, imageDimensions)).toBe(true);
    });
  });

  describe("convertToNormalized", () => {
    test("converts pixel coordinates to normalized", () => {
      const pixels = { x: 960, y: 540, width: 192, height: 54 };
      const result = coordinateConverter.convertToNormalized(pixels, imageDimensions);

      expect(result.x).toBeCloseTo(0.5, 5);
      expect(result.y).toBeCloseTo(0.5, 5);
      expect(result.width).toBeCloseTo(0.1, 5);
      expect(result.height).toBeCloseTo(0.05, 5);
    });

    test("converts coordinates at top-left corner", () => {
      const pixels = { x: 0, y: 0, width: 192, height: 108 };
      const result = coordinateConverter.convertToNormalized(pixels, imageDimensions);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.width).toBeCloseTo(0.1, 5);
      expect(result.height).toBeCloseTo(0.1, 5);
    });

    test("converts full-screen box", () => {
      const pixels = { x: 0, y: 0, width: 1920, height: 1080 };
      const result = coordinateConverter.convertToNormalized(pixels, imageDimensions);

      expect(result).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    });

    test("round-trip conversion preserves coordinates", () => {
      const original = { x: 0.3, y: 0.4, width: 0.15, height: 0.08 };
      const toPixels = coordinateConverter.convertToPixels(original, imageDimensions);
      const backToNormalized = coordinateConverter.convertToNormalized(toPixels, imageDimensions);

      expect(backToNormalized.x).toBeCloseTo(original.x, 5);
      expect(backToNormalized.y).toBeCloseTo(original.y, 5);
      expect(backToNormalized.width).toBeCloseTo(original.width, 5);
      expect(backToNormalized.height).toBeCloseTo(original.height, 5);
    });
  });

  describe("edge cases", () => {
    test("handles very large image dimensions", () => {
      const largeImage = { width: 7680, height: 4320 }; // 8K resolution
      const normalized = { x: 0.5, y: 0.5, width: 0.1, height: 0.1 };
      const result = coordinateConverter.convertToPixels(normalized, largeImage);

      expect(result.x).toBe(3840);
      expect(result.y).toBe(2160);
      expect(result.width).toBe(768);
      expect(result.height).toBe(432);
    });

    test("handles very small image dimensions", () => {
      const smallImage = { width: 640, height: 480 };
      const normalized = { x: 0.5, y: 0.5, width: 0.1, height: 0.1 };
      const result = coordinateConverter.convertToPixels(normalized, smallImage);

      expect(result.x).toBe(320);
      expect(result.y).toBe(240);
      expect(result.width).toBe(64);
      expect(result.height).toBe(48);
    });

    test("handles aspect ratios different from 16:9", () => {
      const ultrawide = { width: 3440, height: 1440 }; // 21:9
      const normalized = { x: 0.5, y: 0.5, width: 0.2, height: 0.2 };
      const result = coordinateConverter.convertToPixels(normalized, ultrawide);

      expect(result.x).toBe(1720);
      expect(result.y).toBe(720);
      expect(result.width).toBe(688);
      expect(result.height).toBe(288);
    });
  });
});
