<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ config('app.name', 'Factory23') }} API</title>
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #0f1117;
            color: #e2e8f0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            text-align: center;
            padding: 2rem;
            max-width: 600px;
            width: 100%;
        }
        .badge {
            display: inline-block;
            background: #1e293b;
            border: 1px solid #334155;
            color: #94a3b8;
            font-size: 0.75rem;
            font-weight: 600;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            margin-bottom: 1.5rem;
        }
        h1 {
            font-size: 2rem;
            font-weight: 700;
            color: #f1f5f9;
            margin-bottom: 0.5rem;
            letter-spacing: -0.02em;
        }
        .tagline {
            font-size: 1rem;
            color: #64748b;
            margin-bottom: 2.5rem;
        }
        .status-row {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            margin-bottom: 2.5rem;
            font-size: 0.875rem;
            color: #94a3b8;
        }
        .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #22c55e;
            box-shadow: 0 0 6px #22c55e;
            animation: pulse 2s ease-in-out infinite;
            flex-shrink: 0;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
        }
        .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1px;
            background: #1e293b;
            border: 1px solid #1e293b;
            border-radius: 0.75rem;
            overflow: hidden;
            margin-bottom: 2rem;
        }
        .meta-cell {
            background: #0f1117;
            padding: 1rem 1.25rem;
            text-align: left;
        }
        .meta-cell .label {
            font-size: 0.7rem;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #475569;
            margin-bottom: 0.25rem;
        }
        .meta-cell .value {
            font-size: 0.875rem;
            color: #cbd5e1;
            font-weight: 500;
        }
        .footer {
            font-size: 0.75rem;
            color: #334155;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="badge">REST API</div>

        <h1>{{ __('Factory23 API') }}</h1>
        <!-- <p class="tagline">Backend API &mdash; All user interfaces are served by the frontend application.</p> -->

        <div class="status-row">
            <span class="dot"></span>
            <span>API is running</span>
        </div>

        <div class="meta-grid">
            <div class="meta-cell">
                <div class="label">Version</div>
                <div class="value">v1</div>
            </div>
            <div class="meta-cell">
                <div class="label">Environment</div>
                <div class="value">{{ app()->environment() }}</div>
            </div>
            <!-- <div class="meta-cell">
                <div class="label">Base URL</div>
                <div class="value">/api/v1</div>
            </div>
            <div class="meta-cell">
                <div class="label">Admin Panel</div>
                <div class="value"><a href="/admin/login" style="color:#60a5fa;text-decoration:none;">/admin</a></div>
            </div> -->
        </div>

        <!-- <p class="footer">This is a backend-only service. Requests to user-facing pages should be directed to the frontend application.</p> -->
    </div>
</body>
</html>
