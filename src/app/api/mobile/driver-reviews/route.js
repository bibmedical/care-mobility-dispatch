import { NextResponse } from 'next/server';
import { readNemtAdminPayload } from '@/server/nemt-admin-store';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';
import { readSystemMessages, upsertSystemMessage } from '@/server/system-messages-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { buildMobileCorsPreflightResponse, jsonWithMobileCors, withMobileCors } from '@/server/mobile-api-cors';

const normalizeLookupValue = value => String(value ?? '').trim().toLowerCase();

const resolveDriverByLookup = async lookup => {
  const adminPayload = await readNemtAdminPayload();
  const lookupValue = normalizeLookupValue(lookup);
  return (Array.isArray(adminPayload?.dispatchDrivers) ? adminPayload.dispatchDrivers : []).find(driver => {
    return [driver?.id, driver?.code, driver?.name, driver?.nickname].map(normalizeLookupValue).filter(Boolean).includes(lookupValue);
  }) || null;
};

const buildRatingBreakdown = reviews => {
  const result = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0
  };
  for (const review of reviews) {
    const rating = Number(review?.rating || 0);
    if (rating >= 1 && rating <= 5) {
      result[rating] += 1;
    }
  }
  return result;
};

const buildSummaryResponse = ({ driver, reviews, dispatchTrips }) => {
  const totalReviews = reviews.length;
  const averageRating = totalReviews > 0
    ? Number((reviews.reduce((sum, review) => sum + Number(review?.rating || 0), 0) / totalReviews).toFixed(1))
    : 0;
  const normalizedDriverId = String(driver?.id || '').trim();
  const driverTrips = dispatchTrips.filter(trip => String(trip?.driverId || '').trim() === normalizedDriverId);
  const completedTrips = driverTrips.filter(trip => {
    const status = String(trip?.status || '').trim().toLowerCase();
    return status === 'completed';
  }).length;

  const startDateCandidates = [
    driver?.hireDate,
    driver?.startDate,
    driver?.createdAt,
    ...driverTrips.map(trip => trip?.serviceDate),
    ...driverTrips.map(trip => trip?.createdAt)
  ];
  const parsedStartTimestamps = startDateCandidates
    .map(value => new Date(value || 0).getTime())
    .filter(value => Number.isFinite(value) && value > 0);
  const firstKnownTimestamp = parsedStartTimestamps.length > 0 ? Math.min(...parsedStartTimestamps) : 0;
  const yearsWithCompany = firstKnownTimestamp > 0
    ? Math.max(0, new Date().getFullYear() - new Date(firstKnownTimestamp).getFullYear())
    : 0;

  return {
    driverId: String(driver?.id || '').trim(),
    driverName: String(driver?.name || '').trim() || 'Driver',
    vehicle: String(driver?.vehicle || '').trim(),
    totalReviews,
    averageRating,
    completedTrips,
    yearsWithCompany,
    ratingBreakdown: buildRatingBreakdown(reviews),
    recentReviews: reviews
      .slice(0, 8)
      .map(review => ({
        id: String(review?.id || '').trim(),
        tripId: String(review?.tripId || '').trim(),
        rating: Number(review?.rating || 0),
        comment: String(review?.comment || '').trim(),
        riderName: String(review?.riderName || '').trim(),
        createdAt: review?.createdAt || null
      }))
  };
};

const getReviewHtml = ({ tripId, token, submitted, error = '', rating = '', comment = '', riderName = '' }) => {
  const safeError = String(error || '').replace(/[<>]/g, '');
  const safeTripId = String(tripId || '').replace(/["<>]/g, '');
  const safeToken = String(token || '').replace(/["<>]/g, '');
  const safeComment = String(comment || '').replace(/[<>]/g, '');
  const safeRiderName = String(riderName || '').replace(/[<>]/g, '');
  const thankYouBlock = submitted
    ? '<p class="success">Thank you. Your review was saved successfully.</p>'
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Driver Review</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f7fb; color: #1f2937; }
    .card { max-width: 520px; margin: 0 auto; background: #fff; border: 1px solid #dbe3ef; border-radius: 14px; padding: 20px; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    p { margin: 0 0 14px; color: #4b5563; }
    .row { margin-bottom: 12px; }
    label { display: block; margin-bottom: 8px; font-weight: 700; }
    input, textarea, select { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px; border: 1px solid #c7d2e5; font-size: 15px; }
    textarea { min-height: 84px; resize: vertical; }
    button { width: 100%; background: #1f8a54; color: #fff; border: 0; border-radius: 10px; padding: 12px; font-weight: 700; font-size: 15px; cursor: pointer; }
    .error { background: #fee2e2; color: #991b1b; border-radius: 10px; padding: 10px; margin-bottom: 12px; }
    .success { background: #dcfce7; color: #166534; border-radius: 10px; padding: 10px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Rate your ride</h1>
    <p>Please rate your driver experience from 1 to 5 stars.</p>
    ${safeError ? `<div class="error">${safeError}</div>` : ''}
    ${thankYouBlock}
    <form method="POST" action="/api/mobile/driver-reviews">
      <input type="hidden" name="tripId" value="${safeTripId}" />
      <input type="hidden" name="reviewToken" value="${safeToken}" />
      <div class="row">
        <label for="rating">Rating</label>
        <select name="rating" id="rating" required>
          <option value="" ${!rating ? 'selected' : ''}>Select rating</option>
          <option value="5" ${String(rating) === '5' ? 'selected' : ''}>5 - Excellent</option>
          <option value="4" ${String(rating) === '4' ? 'selected' : ''}>4 - Good</option>
          <option value="3" ${String(rating) === '3' ? 'selected' : ''}>3 - Okay</option>
          <option value="2" ${String(rating) === '2' ? 'selected' : ''}>2 - Poor</option>
          <option value="1" ${String(rating) === '1' ? 'selected' : ''}>1 - Bad</option>
        </select>
      </div>
      <div class="row">
        <label for="riderName">Your name (optional)</label>
        <input name="riderName" id="riderName" maxlength="60" value="${safeRiderName}" />
      </div>
      <div class="row">
        <label for="comment">Comment (optional)</label>
        <textarea name="comment" id="comment" maxlength="420">${safeComment}</textarea>
      </div>
      <button type="submit">Submit review</button>
    </form>
  </div>
</body>
</html>`;
};

const readReviewMessages = async driverId => {
  const allMessages = await readSystemMessages();
  return allMessages
    .filter(message => {
      const type = String(message?.type || '').trim().toLowerCase();
      const sameDriver = String(message?.driverId || '').trim() === String(driverId || '').trim();
      return type === 'driver-review' && sameDriver;
    })
    .sort((left, right) => new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime());
};

const submitTripReview = async ({ tripId, reviewToken, rating, comment, riderName }) => {
  const normalizedTripId = String(tripId || '').trim();
  const normalizedToken = String(reviewToken || '').trim();
  const normalizedComment = String(comment || '').trim().slice(0, 420);
  const normalizedRiderName = String(riderName || '').trim().slice(0, 60);
  const normalizedRating = Number.parseInt(String(rating || ''), 10);

  if (!normalizedTripId || !normalizedToken) {
    throw new Error('Missing trip or review token.');
  }
  if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
    throw new Error('Rating must be between 1 and 5.');
  }

  const dispatchState = await readNemtDispatchState({ includePastDates: true });
  const trips = Array.isArray(dispatchState?.trips) ? dispatchState.trips : [];
  const targetTrip = trips.find(trip => String(trip?.id || '').trim() === normalizedTripId);

  if (!targetTrip) {
    throw new Error('Trip not found.');
  }

  if (String(targetTrip?.reviewRequestToken || '').trim() !== normalizedToken) {
    throw new Error('This review link is invalid or expired.');
  }

  const driverId = String(targetTrip?.driverId || '').trim();
  if (!driverId) {
    throw new Error('Trip has no assigned driver.');
  }

  const reviewId = `driver-review-${normalizedTripId}`;
  const createdAt = new Date().toISOString();
  await upsertSystemMessage({
    id: reviewId,
    type: 'driver-review',
    status: 'active',
    priority: 'normal',
    subject: `Driver review for trip ${normalizedTripId}`,
    body: normalizedComment || `Rating ${normalizedRating}/5`,
    driverId,
    tripId: normalizedTripId,
    rating: normalizedRating,
    comment: normalizedComment,
    riderName: normalizedRiderName,
    source: 'review-form',
    deliveryMethod: 'web',
    createdAt
  });

  const nextTrips = trips.map(trip => {
    if (String(trip?.id || '').trim() !== normalizedTripId) return trip;
    return {
      ...trip,
      reviewSubmittedAt: createdAt,
      reviewRating: normalizedRating,
      reviewComment: normalizedComment,
      reviewRiderName: normalizedRiderName,
      reviewRequestStatus: 'submitted',
      updatedAt: Date.now()
    };
  });

  await writeNemtDispatchState({
    ...dispatchState,
    trips: nextTrips
  });

  return {
    tripId: normalizedTripId,
    driverId,
    rating: normalizedRating,
    comment: normalizedComment,
    riderName: normalizedRiderName,
    createdAt
  };
};

const internalError = (request, error) => jsonWithMobileCors(request, { ok: false, error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = String(searchParams.get('tripId') || '').trim();
    const reviewToken = String(searchParams.get('token') || '').trim();

    // Public review URL mode: renders a simple form.
    if (tripId && reviewToken) {
      return new NextResponse(getReviewHtml({ tripId, token: reviewToken, submitted: false }), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      });
    }

    const driverLookup = searchParams.get('driverId') || searchParams.get('driverCode');
    if (!driverLookup) {
      return jsonWithMobileCors(request, { ok: false, error: 'driverId or driverCode is required.' }, { status: 400 });
    }

    const authResult = await authorizeMobileDriverRequest(request, driverLookup, {
      allowLegacyWithoutSession: true
    });
    if (authResult.response) return withMobileCors(authResult.response, request);

    const driver = await resolveDriverByLookup(driverLookup);
    if (!driver) {
      return jsonWithMobileCors(request, { ok: false, error: 'Driver not found.' }, { status: 404 });
    }

    const [reviews, dispatchState] = await Promise.all([
      readReviewMessages(driver.id),
      readNemtDispatchState({ includePastDates: true })
    ]);
    const trips = Array.isArray(dispatchState?.trips) ? dispatchState.trips : [];

    return jsonWithMobileCors(request, {
      ok: true,
      summary: buildSummaryResponse({
        driver,
        reviews,
        dispatchTrips: trips
      })
    });
  } catch (error) {
    return internalError(request, error);
  }
}

export async function POST(request) {
  try {
    const contentType = String(request.headers.get('content-type') || '').toLowerCase();
    const isFormPost = contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data');

    if (isFormPost) {
      const formData = await request.formData();
      const tripId = String(formData.get('tripId') || '').trim();
      const reviewToken = String(formData.get('reviewToken') || '').trim();
      const rating = String(formData.get('rating') || '').trim();
      const comment = String(formData.get('comment') || '').trim();
      const riderName = String(formData.get('riderName') || '').trim();

      try {
        await submitTripReview({
          tripId,
          reviewToken,
          rating,
          comment,
          riderName
        });
        return new NextResponse(getReviewHtml({ tripId, token: reviewToken, submitted: true }), {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8'
          }
        });
      } catch (error) {
        return new NextResponse(getReviewHtml({
          tripId,
          token: reviewToken,
          submitted: false,
          error: error instanceof Error ? error.message : 'Unable to submit review.',
          rating,
          comment,
          riderName
        }), {
          status: 400,
          headers: {
            'Content-Type': 'text/html; charset=utf-8'
          }
        });
      }
    }

    const body = await request.json();
    const review = await submitTripReview({
      tripId: body?.tripId,
      reviewToken: body?.reviewToken,
      rating: body?.rating,
      comment: body?.comment,
      riderName: body?.riderName
    });

    return jsonWithMobileCors(request, {
      ok: true,
      review
    });
  } catch (error) {
    return internalError(request, error);
  }
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}