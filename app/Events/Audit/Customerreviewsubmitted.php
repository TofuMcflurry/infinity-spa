<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class CustomerReviewSubmitted extends AuditEvent
{
    public function __construct(int $bookingId, int $rating, ?Request $request = null)
    {
        parent::__construct('customer.review_submitted', 'Booking', $bookingId, ['rating' => $rating], $request);
    }
}