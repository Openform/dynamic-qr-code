import { GET } from '../route';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  getQRCodeByShortId: jest.fn(),
  incrementScanCount: jest.fn(),
}));

const { getQRCodeByShortId, incrementScanCount } = require('@/lib/db');

describe('GET /r/[shortId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to home page if qr code is missing', async () => {
    getQRCodeByShortId.mockResolvedValue(null);

    const request = {
      url: 'http://localhost:3000/r/notfound'
    };

    const params = Promise.resolve({ shortId: 'notfound' });

    const response = await GET(request, { params });

    expect(response.status).toBe(307); // NextResponse.redirect defaults to 307
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
    expect(getQRCodeByShortId).toHaveBeenCalledWith('notfound');
    expect(incrementScanCount).not.toHaveBeenCalled();
  });

  it('redirects to destination url if qr code is found and increments scan count', async () => {
    getQRCodeByShortId.mockResolvedValue({ destination_url: 'https://example.com' });
    incrementScanCount.mockResolvedValue();

    const request = {
      url: 'http://localhost:3000/r/found'
    };

    const params = Promise.resolve({ shortId: 'found' });

    const response = await GET(request, { params });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://example.com/');
    expect(getQRCodeByShortId).toHaveBeenCalledWith('found');
    expect(incrementScanCount).toHaveBeenCalledWith('found');
  });

  it('adds https:// if destination url misses protocol', async () => {
    getQRCodeByShortId.mockResolvedValue({ destination_url: 'example.com' });
    incrementScanCount.mockResolvedValue();

    const request = {
      url: 'http://localhost:3000/r/found'
    };

    const params = Promise.resolve({ shortId: 'found' });

    const response = await GET(request, { params });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://example.com/');
    expect(getQRCodeByShortId).toHaveBeenCalledWith('found');
    expect(incrementScanCount).toHaveBeenCalledWith('found');
  });

  it('redirects to home page if an error occurs', async () => {
    getQRCodeByShortId.mockRejectedValue(new Error('Database error'));

    const request = {
      url: 'http://localhost:3000/r/error'
    };

    const params = Promise.resolve({ shortId: 'error' });

    // Silence console.error for this test since the code logs the error
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET(request, { params });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/');

    consoleSpy.mockRestore();
  });
});
