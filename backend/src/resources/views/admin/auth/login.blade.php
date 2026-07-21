<!doctype html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Admin Login | {{ config('admin.brand') }}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"
        integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            min-height: 100vh;
            background: #0f172a;
            position: relative;
            overflow: hidden;
        }

        body::before {
            content: '';
            position: absolute;
            width: 500px;
            height: 500px;
            background: radial-gradient(circle, rgba(99, 102, 241, .15) 0%, transparent 70%);
            top: -100px;
            right: -100px;
            pointer-events: none;
        }

        body::after {
            content: '';
            position: absolute;
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, rgba(139, 92, 246, .1) 0%, transparent 70%);
            bottom: -80px;
            left: -80px;
            pointer-events: none;
        }

        .login-card {
            width: 100%;
            max-width: 420px;
            border: 1px solid rgba(255, 255, 255, .06);
            border-radius: 1rem;
            background: rgba(255, 255, 255, .03);
            backdrop-filter: blur(12px);
            box-shadow: 0 24px 48px rgba(0, 0, 0, .25);
        }

        .login-card .form-control {
            background: rgba(255, 255, 255, .05);
            border: 1px solid rgba(255, 255, 255, .1);
            color: #e2e8f0;
            border-radius: .5rem;
            padding: .6rem .85rem;
            font-size: .875rem;
        }

        .login-card .form-control:focus {
            background: rgba(255, 255, 255, .08);
            border-color: #6366f1;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, .15);
            color: #f8fafc;
        }

        .login-card .form-control::placeholder {
            color: rgba(255, 255, 255, .3);
        }

        .login-card .form-label {
            color: #94a3b8;
            font-size: .8rem;
            font-weight: 500;
        }

        .login-card .form-check-label {
            color: #94a3b8;
            font-size: .82rem;
        }

        .login-card .form-check-input {
            border-color: rgba(255, 255, 255, .15);
            background-color: transparent;
        }

        .login-card .form-check-input:checked {
            background-color: #6366f1;
            border-color: #6366f1;
        }

        .login-card .btn-primary {
            background: #6366f1;
            border-color: #6366f1;
            border-radius: .5rem;
            font-weight: 600;
            padding: .6rem;
        }

        .login-card .btn-primary:hover {
            background: #4f46e5;
            border-color: #4f46e5;
        }

        .login-card .alert {
            background: rgba(239, 68, 68, .1);
            border: 1px solid rgba(239, 68, 68, .2);
            color: #fca5a5;
            border-radius: .5rem;
            font-size: .82rem;
        }

        .brand-icon {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            border-radius: .6rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-size: 1.1rem;
        }
    </style>
</head>

<body class="d-flex align-items-center justify-content-center p-3">
    <div class="card login-card">
        <div class="card-body p-4 p-md-5">
            <div class="text-center mb-4">
                <div class="brand-icon mb-3 mx-auto">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor"
                        viewBox="0 0 16 16">
                        <path
                            d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5l2.404.961L10.404 2zm3.564 1.426L5.596 5 8 5.961 14.154 3.5zm3.25 1.7-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923zM7.443.184a1.5 1.5 0 0 1 1.114 0l7.129 2.852A.5.5 0 0 1 16 3.5v8.662a1 1 0 0 1-.629.928l-7.185 2.874a.5.5 0 0 1-.372 0L.63 13.09a1 1 0 0 1-.63-.928V3.5a.5.5 0 0 1 .314-.464z" />
                    </svg>
                </div>
                <h4 class="mb-1" style="color:#f8fafc;font-weight:700;font-size:1.15rem">{{ config('admin.brand') }}
                </h4>
                <p style="color:#64748b;font-size:.82rem" class="mb-0">Sign in to your admin account</p>
            </div>

            @if ($errors->any())
                <div class="alert mb-3">
                    <ul class="mb-0 ps-3">
                        @foreach ($errors->all() as $error)
                            <li>{{ $error }}</li>
                        @endforeach
                    </ul>
                </div>
            @endif

            <form method="POST" action="{{ route('admin.login.store') }}">
                @csrf
                <div class="mb-3">
                    <label class="form-label">Email</label>
                    <input type="email" name="email" value="{{ old('email') }}" class="form-control"
                        placeholder="admin@example.com" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Password</label>
                    <input type="password" name="password" class="form-control" placeholder="Enter your password"
                        required>
                </div>
                <div class="form-check mb-4">
                    <input class="form-check-input" type="checkbox" name="remember" value="1" id="remember">
                    <label class="form-check-label" for="remember">Remember me</label>
                </div>
                <button type="submit" class="btn btn-primary w-100">Sign In</button>
            </form>
        </div>
    </div>
</body>

</html>
