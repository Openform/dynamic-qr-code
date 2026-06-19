const { toClientQRCode, BASE_URL } = require('./utils');

describe('toClientQRCode', () => {
  it('should correctly transform a DB record (snake_case) to client shape (camelCase)', () => {
    const mockDbRecord = {
      id: 1,
      short_id: 'abc123xyz',
      user_id: 42,
      title: 'My QR Code',
      destination_url: 'https://example.com',
      foreground_color: '#000000',
      background_color: '#ffffff',
      logo_url: 'https://example.com/logo.png',
      dot_style: 'rounded',
      corner_square_style: 'extra-rounded',
      corner_dot_style: 'dot',
      scan_count: 5,
      created_at: '2023-01-01T00:00:00.000Z',
      updated_at: '2023-01-02T00:00:00.000Z',
    };

    const expectedClientShape = {
      id: 1,
      shortId: 'abc123xyz',
      userId: 42,
      title: 'My QR Code',
      destinationUrl: 'https://example.com',
      fgColor: '#000000',
      bgColor: '#ffffff',
      logoUrl: 'https://example.com/logo.png',
      dotStyle: 'rounded',
      cornerSquareStyle: 'extra-rounded',
      cornerDotStyle: 'dot',
      scanCount: 5,
      createdAt: '2023-01-01T00:00:00.000Z',
      updatedAt: '2023-01-02T00:00:00.000Z',
      redirectUrl: `${BASE_URL}/r/abc123xyz`,
    };

    const result = toClientQRCode(mockDbRecord);
    expect(result).toEqual(expectedClientShape);
  });

  it('should handle missing optional fields', () => {
    const mockDbRecordPartial = {
      id: 2,
      short_id: 'def456uvw',
      user_id: 10,
      title: 'Minimal QR',
      destination_url: 'https://minimal.example.com',
      // omitting optional fields like colors, logo, styles, etc.
    };

    const result = toClientQRCode(mockDbRecordPartial);

    expect(result.id).toBe(2);
    expect(result.shortId).toBe('def456uvw');
    expect(result.title).toBe('Minimal QR');
    expect(result.destinationUrl).toBe('https://minimal.example.com');

    // Check that missing fields map to undefined (or whatever the implementation does)
    expect(result.fgColor).toBeUndefined();
    expect(result.logoUrl).toBeUndefined();

    // Redirect URL should still be constructed correctly
    expect(result.redirectUrl).toBe(`${BASE_URL}/r/def456uvw`);
  });

  it('should handle null values correctly', () => {
    const mockDbRecordWithNulls = {
      id: 3,
      short_id: 'ghi789rst',
      user_id: 99,
      title: 'Null fields QR',
      destination_url: 'https://nulls.example.com',
      foreground_color: null,
      background_color: null,
      logo_url: null,
    };

    const result = toClientQRCode(mockDbRecordWithNulls);

    expect(result.id).toBe(3);
    expect(result.shortId).toBe('ghi789rst');
    expect(result.fgColor).toBeNull();
    expect(result.bgColor).toBeNull();
    expect(result.logoUrl).toBeNull();
    expect(result.redirectUrl).toBe(`${BASE_URL}/r/ghi789rst`);
  });
});
