import { GET } from './route';
import { NextResponse } from 'next/server';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  getQRCodeByShortId: jest.fn(),
  incrementScanCount: jest.fn(),
}));
const { getQRCodeByShortId, incrementScanCount } = require('@/lib/db');

jest.mock('next/server', () => {
  return {
    NextResponse: {
      redirect: jest.fn(),
    },
  };
});

describe('GET /r/[shortId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should redirect to the destination URL if it has a valid protocol', async () => {
    const mockShortId = 'valid123';
    const mockDestination = 'https://example.com/target';

    // Setup mocks
    getQRCodeByShortId.mockResolvedValue({ destination_url: mockDestination });
    incrementScanCount.mockResolvedValue();

    // Execute
    const request = { url: 'http://localhost:3000/r/valid123' };
    const params = Promise.resolve({ shortId: mockShortId });
    await GET(request, { params });

    // Assert
    expect(getQRCodeByShortId).toHaveBeenCalledWith(mockShortId);
    expect(incrementScanCount).toHaveBeenCalledWith(mockShortId);
    expect(NextResponse.redirect).toHaveBeenCalledWith(new URL(mockDestination), 302);
  });

  it('should prepend https:// if the destination URL is missing a protocol', async () => {
    const mockShortId = 'noprotocol';
    const mockDestination = 'example.com/target';

    // Setup mocks
    getQRCodeByShortId.mockResolvedValue({ destination_url: mockDestination });
    incrementScanCount.mockResolvedValue();

    // Execute
    const request = { url: 'http://localhost:3000/r/noprotocol' };
    const params = Promise.resolve({ shortId: mockShortId });
    await GET(request, { params });

    // Assert
    expect(getQRCodeByShortId).toHaveBeenCalledWith(mockShortId);
    expect(incrementScanCount).toHaveBeenCalledWith(mockShortId);
    expect(NextResponse.redirect).toHaveBeenCalledWith(new URL('https://example.com/target'), 302);
  });

  it('should redirect to home page if QR code is not found', async () => {
    const mockShortId = 'notfound';

    // Setup mocks
    getQRCodeByShortId.mockResolvedValue(null);

    // Execute
    const request = { url: 'http://localhost:3000/r/notfound' };
    const params = Promise.resolve({ shortId: mockShortId });
    await GET(request, { params });

    // Assert
    expect(getQRCodeByShortId).toHaveBeenCalledWith(mockShortId);
    expect(incrementScanCount).not.toHaveBeenCalled();
    expect(NextResponse.redirect).toHaveBeenCalledWith(new URL('http://localhost:3000/')); // undefined status code for default redirect
  });

  it('should catch errors and redirect to home page', async () => {
    const mockShortId = 'errorcase';

    // Setup mocks
    const error = new Error('Database connection failed');
    getQRCodeByShortId.mockRejectedValue(error);

    // Spy on console.error to avoid test output noise
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Execute
    const request = { url: 'http://localhost:3000/r/errorcase' };
    const params = Promise.resolve({ shortId: mockShortId });
    await GET(request, { params });

    // Assert
    expect(getQRCodeByShortId).toHaveBeenCalledWith(mockShortId);
    expect(incrementScanCount).not.toHaveBeenCalled();
    expect(NextResponse.redirect).toHaveBeenCalledWith(new URL('http://localhost:3000/'));
    expect(consoleSpy).toHaveBeenCalledWith('Redirect error:', error);

    // Cleanup
    consoleSpy.mockRestore();
  });
});
