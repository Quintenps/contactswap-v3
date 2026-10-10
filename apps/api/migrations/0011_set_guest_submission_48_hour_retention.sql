UPDATE guest_submissions
SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', julianday(created_at) + 2);
