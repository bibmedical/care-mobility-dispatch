import { NextResponse } from 'next/server';

const MOBILE_API_ALLOWED_HEADERS = ['Content-Type', 'X-Driver-Device-Id', 'X-Driver-Session-Token'];
const MOBILE_API_ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'];

const getAllowedOrigin = request => {
  const origin = String(request?.headers?.get('origin') || '').trim();
  return origin || '*';
};

export const buildMobileCorsHeaders = request => ({
  'Access-Control-Allow-Origin': getAllowedOrigin(request),
  'Access-Control-Allow-Methods': MOBILE_API_ALLOWED_METHODS.join(', '),
  'Access-Control-Allow-Headers': MOBILE_API_ALLOWED_HEADERS.join(', '),
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin'
});

export const withMobileCors = (response, request) => {
  const headers = buildMobileCorsHeaders(request);
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
};

export const jsonWithMobileCors = (request, body, init = {}) => {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...buildMobileCorsHeaders(request),
      ...(init?.headers || {})
    }
  });
};

export const buildMobileCorsPreflightResponse = request => new NextResponse(null, {
  status: 204,
  headers: buildMobileCorsHeaders(request)
});