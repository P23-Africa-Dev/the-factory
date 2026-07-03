<!doctype html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', config('admin.brand'))</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"
        integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --sidebar-width: 260px;
            --sidebar-width-collapsed: 72px;
            --sidebar-bg: #0f172a;
            --sidebar-hover: rgba(255, 255, 255, .06);
            --sidebar-active: rgba(99, 132, 255, .15);
            --sidebar-active-border: #6366f1;
            --topbar-height: 60px;
            --surface: #ffffff;
            --surface-hover: #f8fafc;
            --border: #e2e8f0;
            --border-light: #f1f5f9;
            --text-primary: #0f172a;
            --text-secondary: #64748b;
            --text-muted: #94a3b8;
            --accent: #6366f1;
            --accent-light: rgba(99, 102, 241, .08);
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
            --info: #3b82f6;
            --radius: .75rem;
            --radius-lg: 1rem;
            --shadow-sm: 0 1px 2px rgba(0, 0, 0, .05);
            --shadow: 0 1px 3px rgba(0, 0, 0, .06), 0 1px 2px rgba(0, 0, 0, .04);
            --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, .07), 0 2px 4px -2px rgba(0, 0, 0, .05);
        }

        * {
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background: #f1f5f9;
            font-size: .875rem;
            color: var(--text-primary);
            line-height: 1.5;
            margin: 0;
            overflow-x: hidden;
        }

        body.sidebar-collapsed {
            --sidebar-width: var(--sidebar-width-collapsed);
        }

        /* ── Sidebar ─────────────────────────────────── */
        .admin-sidebar {
            width: var(--sidebar-width);
            height: 100vh;
            background: var(--sidebar-bg);
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            display: flex;
            flex-direction: column;
            z-index: 1040;
            overflow-y: auto;
            overflow-x: hidden;
            transition: transform .25s cubic-bezier(.4, 0, .2, 1);
        }

        .sidebar-brand {
            padding: 1.25rem 1.5rem;
            border-bottom: 1px solid rgba(255, 255, 255, .06);
            display: flex;
            align-items: center;
            gap: .65rem;
            min-height: var(--topbar-height);
            position: relative;
        }

        .sidebar-collapse-btn {
            margin-left: auto;
            background: rgba(255, 255, 255, .06);
            border: 0;
            color: rgba(255, 255, 255, .55);
            width: 28px;
            height: 28px;
            border-radius: .4rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            flex-shrink: 0;
            transition: background .15s ease, color .15s ease;
        }

        .sidebar-collapse-btn:hover {
            background: rgba(255, 255, 255, .12);
            color: #fff;
        }

        .sidebar-brand-icon {
            width: 32px;
            height: 32px;
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            border-radius: .5rem;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-size: .9rem;
            flex-shrink: 0;
        }

        .sidebar-brand h5 {
            font-size: .95rem;
            font-weight: 700;
            color: #fff;
            letter-spacing: -.02em;
            margin: 0;
        }

        .sidebar-section-label {
            color: rgba(255, 255, 255, .28);
            font-size: .65rem;
            font-weight: 600;
            letter-spacing: .1em;
            text-transform: uppercase;
            padding: 1.5rem 1.5rem .5rem;
        }

        .sidebar-nav {
            padding: 0 .75rem;
        }

        .sidebar-nav .nav-link {
            color: rgba(255, 255, 255, .55);
            border-radius: .5rem;
            padding: .6rem .75rem;
            margin-bottom: 2px;
            display: flex;
            align-items: center;
            gap: .65rem;
            font-size: .82rem;
            font-weight: 500;
            transition: all .15s ease;
            white-space: nowrap;
            border-left: 3px solid transparent;
            text-decoration: none;
        }

        .sidebar-nav .nav-link i {
            font-size: 1rem;
            flex-shrink: 0;
            width: 20px;
            text-align: center;
        }

        .sidebar-nav .nav-link-text {
            transition: opacity .15s ease;
        }

        body.sidebar-collapsed .sidebar-brand {
            justify-content: center;
            padding: 1rem .75rem;
            gap: 0;
        }

        body.sidebar-collapsed .sidebar-brand-text,
        body.sidebar-collapsed .sidebar-section-label,
        body.sidebar-collapsed .nav-link-text,
        body.sidebar-collapsed .sidebar-footer .admin-meta,
        body.sidebar-collapsed .sidebar-collapse-btn {
            display: none;
        }

        body.sidebar-collapsed .sidebar-nav {
            padding: 0 .5rem;
        }

        body.sidebar-collapsed .sidebar-nav .nav-link {
            justify-content: center;
            padding: .65rem;
            gap: 0;
        }

        body.sidebar-collapsed .sidebar-footer {
            padding: 1rem .5rem;
            display: flex;
            justify-content: center;
        }

        .sidebar-nav .nav-link:hover {
            background: var(--sidebar-hover);
            color: rgba(255, 255, 255, .85);
        }

        .sidebar-nav .nav-link.active {
            background: var(--sidebar-active);
            color: #fff;
            border-left-color: var(--sidebar-active-border);
            font-weight: 600;
        }

        .sidebar-footer {
            margin-top: auto;
            padding: 1rem 1.25rem;
            border-top: 1px solid rgba(255, 255, 255, .06);
        }

        .sidebar-footer .admin-avatar {
            width: 34px;
            height: 34px;
            border-radius: .5rem;
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: .8rem;
            font-weight: 600;
            flex-shrink: 0;
        }

        .sidebar-footer .admin-name {
            color: #fff;
            font-size: .8rem;
            font-weight: 600;
        }

        .sidebar-footer .admin-role {
            color: rgba(255, 255, 255, .35);
            font-size: .7rem;
            font-weight: 500;
        }

        /* ── Backdrop (mobile) ───────────────────────── */
        .sidebar-backdrop {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, .5);
            z-index: 1035;
            backdrop-filter: blur(2px);
        }

        .sidebar-backdrop.show {
            display: block;
        }

        /* ── Main ────────────────────────────────────── */
        .admin-main {
            margin-left: var(--sidebar-width);
            width: calc(100vw - var(--sidebar-width));
            max-width: calc(100vw - var(--sidebar-width));
            min-height: 100vh;
            min-width: 0;
            display: flex;
            flex-direction: column;
            transition: margin-left .25s cubic-bezier(.4, 0, .2, 1), width .25s cubic-bezier(.4, 0, .2, 1), max-width .25s cubic-bezier(.4, 0, .2, 1);
            overflow-x: hidden;
        }

        .admin-topbar {
            background: var(--surface);
            border-bottom: 1px solid var(--border);
            padding: 0 2rem;
            height: var(--topbar-height);
            position: sticky;
            top: 0;
            z-index: 1030;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
        }

        .topbar-left {
            display: flex;
            align-items: center;
            gap: .75rem;
        }

        .sidebar-toggle {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: none;
            border: 1px solid var(--border);
            border-radius: .5rem;
            padding: .35rem .5rem;
            color: var(--text-secondary);
            cursor: pointer;
            line-height: 1;
            flex-shrink: 0;
        }

        .sidebar-toggle:hover {
            background: var(--surface-hover);
        }

        .admin-topbar .page-title {
            font-size: 1.05rem;
            font-weight: 700;
            color: var(--text-primary);
            margin: 0;
            line-height: 1.2;
        }

        .admin-content {
            padding: 1.75rem 2rem;
            flex: 1;
            min-width: 0;
            max-width: 100%;
            overflow-x: auto;
        }

        .page-container {
            width: 100%;
            max-width: 100%;
            min-width: 0;
        }

        .page-container .row {
            --bs-gutter-x: 1rem;
        }

        .page-container .metric-card,
        .page-container .stat-card {
            min-width: 0;
        }

        /* ── Cards ───────────────────────────────────── */
        .stat-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-sm);
            transition: box-shadow .15s ease, transform .15s ease;
        }

        .stat-card:hover {
            box-shadow: var(--shadow-md);
            transform: translateY(-1px);
        }

        .stat-card .stat-label {
            color: var(--text-secondary);
            font-size: .72rem;
            font-weight: 600;
            letter-spacing: .04em;
            text-transform: uppercase;
        }

        .stat-card .stat-value {
            font-size: 1.75rem;
            font-weight: 700;
            color: var(--text-primary);
            line-height: 1.15;
        }

        .stat-card .stat-icon {
            width: 42px;
            height: 42px;
            border-radius: var(--radius);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.1rem;
            flex-shrink: 0;
        }

        .metric-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-sm);
        }

        /* ── Tables ──────────────────────────────────── */
        .admin-table {
            margin: 0;
        }

        .admin-table thead th {
            background: var(--surface-hover);
            border-bottom: 1px solid var(--border);
            color: var(--text-secondary);
            font-size: .7rem;
            font-weight: 600;
            letter-spacing: .06em;
            text-transform: uppercase;
            padding: .75rem 1rem;
            white-space: nowrap;
        }

        .admin-table tbody td {
            padding: .75rem 1rem;
            vertical-align: middle;
            border-color: var(--border-light);
            font-size: .85rem;
        }

        .admin-table tbody tr {
            transition: background .1s ease;
        }

        .admin-table tbody tr:hover {
            background: var(--surface-hover);
        }

        .admin-table .action-col {
            width: 56px;
            text-align: center;
        }

        .table-card-header {
            background: var(--surface);
            border-bottom: 1px solid var(--border);
            border-radius: var(--radius-lg) var(--radius-lg) 0 0;
            padding: .85rem 1.25rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: .5rem;
        }

        .table-card-footer {
            background: var(--surface);
            border-top: 1px solid var(--border);
            border-radius: 0 0 var(--radius-lg) var(--radius-lg);
            padding: .85rem 1.25rem;
        }

        /* ── Badges ──────────────────────────────────── */
        .badge-status {
            display: inline-flex;
            align-items: center;
            gap: .3rem;
            padding: .3rem .65rem;
            border-radius: 2rem;
            font-size: .72rem;
            font-weight: 600;
        }

        .badge-active {
            background: rgba(16, 185, 129, .1);
            color: #059669;
        }

        .badge-suspended {
            background: rgba(245, 158, 11, .1);
            color: #d97706;
        }

        .badge-inactive {
            background: rgba(100, 116, 139, .1);
            color: #475569;
        }

        .badge-pending {
            background: rgba(245, 158, 11, .1);
            color: #d97706;
        }

        .badge-approved {
            background: rgba(59, 130, 246, .1);
            color: #2563eb;
        }

        .badge-activated {
            background: rgba(16, 185, 129, .1);
            color: #059669;
        }

        .badge-rejected {
            background: rgba(239, 68, 68, .1);
            color: #dc2626;
        }

        /* ── Filter bar ──────────────────────────────── */
        .filter-bar {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-sm);
            padding: 1rem 1.25rem;
            margin-bottom: 1rem;
        }

        .filter-bar .form-control,
        .filter-bar .form-select {
            border-color: var(--border);
            font-size: .85rem;
            border-radius: .5rem;
        }

        .filter-bar .form-control:focus,
        .filter-bar .form-select:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px var(--accent-light);
        }

        .filter-bar .input-group-text {
            border-color: var(--border);
            background: var(--surface-hover);
        }

        /* ── Detail rows ─────────────────────────────── */
        .detail-row {
            display: flex;
            padding: .65rem 0;
            border-bottom: 1px solid var(--border-light);
            font-size: .85rem;
        }

        .detail-row:last-child {
            border-bottom: 0;
        }

        .detail-label {
            width: 140px;
            flex-shrink: 0;
            color: var(--text-secondary);
            font-weight: 500;
            font-size: .8rem;
        }

        .detail-value {
            color: var(--text-primary);
        }

        /* ── Section headings ────────────────────────── */
        .section-label {
            color: var(--text-secondary);
            font-size: .7rem;
            font-weight: 700;
            letter-spacing: .08em;
            text-transform: uppercase;
            margin-bottom: .75rem;
            display: flex;
            align-items: center;
            gap: .4rem;
        }

        /* ── Buttons ─────────────────────────────────── */
        .btn {
            border-radius: .5rem;
            font-size: .82rem;
            font-weight: 500;
        }

        .btn-sm {
            padding: .4rem .85rem;
        }

        .btn-primary {
            background: var(--accent);
            border-color: var(--accent);
        }

        .btn-primary:hover {
            background: #4f46e5;
            border-color: #4f46e5;
        }

        /* ── Alerts ──────────────────────────────────── */
        .alert {
            border-radius: var(--radius);
            border: 0;
            font-size: .85rem;
            padding: .85rem 1.15rem;
        }

        /* ── Pagination ──────────────────────────────── */
        .pagination {
            margin: 0;
            gap: .25rem;
        }

        .pagination .page-link {
            border-radius: .4rem;
            font-size: .8rem;
            padding: .35rem .7rem;
            border: 1px solid var(--border);
            color: var(--text-secondary);
        }

        .pagination .page-link:hover {
            background: var(--surface-hover);
        }

        .pagination .active .page-link {
            background: var(--accent);
            border-color: var(--accent);
            color: #fff;
        }

        /* ── Modals ──────────────────────────────────── */
        .modal-content {
            border-radius: var(--radius-lg);
            border: 0;
            box-shadow: var(--shadow-md);
        }

        .modal-header {
            border: 0;
            padding: 1.25rem 1.5rem .5rem;
        }

        .modal-body {
            padding: .75rem 1.5rem;
        }

        .modal-footer {
            border: 0;
            padding: .5rem 1.5rem 1.25rem;
        }

        /* ── Dropdown ────────────────────────────────── */
        .dropdown-menu {
            border: 1px solid var(--border);
            border-radius: var(--radius);
            box-shadow: var(--shadow-md);
            padding: .35rem;
            font-size: .82rem;
        }

        .dropdown-item {
            border-radius: .35rem;
            padding: .45rem .75rem;
        }

        /* ── Responsive ──────────────────────────────── */
        @media (max-width: 991.98px) {
            .admin-sidebar {
                transform: translateX(-100%);
                width: var(--sidebar-width);
            }

            body.sidebar-collapsed {
                --sidebar-width: 260px;
            }

            .admin-sidebar.show {
                transform: translateX(0);
            }

            .admin-main {
                margin-left: 0;
                width: 100vw;
                max-width: 100vw;
            }

            .sidebar-collapse-btn {
                display: none;
            }

            .admin-content {
                padding: 1.25rem 1rem;
            }

            .admin-topbar {
                padding: 0 1rem;
            }
        }

        @media (max-width: 575.98px) {
            .admin-content {
                padding: 1rem .75rem;
            }
        }
    </style>
    @stack('styles')
</head>

<body>

    {{-- ── Sidebar Backdrop (mobile) ──────────────────────── --}}
    <div class="sidebar-backdrop" id="sidebarBackdrop"></div>

    {{-- ── Sidebar ────────────────────────────────────────── --}}
    <aside class="admin-sidebar" id="adminSidebar">
        <div class="sidebar-brand">
            <div class="sidebar-brand-icon"><i class="bi bi-hexagon-fill"></i></div>
            <h5 class="sidebar-brand-text mb-0">{{ config('admin.brand') }}</h5>
            <button type="button" class="sidebar-collapse-btn d-none d-lg-inline-flex" id="sidebarCollapseBtn"
                aria-label="Collapse sidebar" title="Collapse sidebar">
                <i class="bi bi-chevron-left"></i>
            </button>
        </div>

        <div class="sidebar-section-label">Main Menu</div>

        <nav class="sidebar-nav">
            <a href="{{ route('admin.dashboard') }}"
                class="nav-link {{ request()->routeIs('admin.dashboard') ? 'active' : '' }}">
                <i class="bi bi-grid-1x2"></i><span class="nav-link-text">Dashboard</span>
            </a>
            <a href="{{ route('admin.users.index') }}"
                class="nav-link {{ request()->routeIs('admin.users.*') ? 'active' : '' }}">
                <i class="bi bi-people"></i><span class="nav-link-text">Users</span>
            </a>
            <a href="{{ route('admin.enterprise.demo-requests.index') }}"
                class="nav-link {{ request()->routeIs('admin.enterprise.*') ? 'active' : '' }}">
                <i class="bi bi-building"></i><span class="nav-link-text">Enterprise</span>
            </a>
            @if (auth('admin')->user()?->canAccessAbility('manage_billing'))
                <a href="{{ route('admin.billing.index') }}"
                    class="nav-link {{ request()->routeIs('admin.billing.*') ? 'active' : '' }}">
                    <i class="bi bi-credit-card-2-front"></i><span class="nav-link-text">Billing</span>
                </a>
            @endif
            <a href="{{ route('admin.ai.index') }}"
                class="nav-link {{ request()->routeIs('admin.ai.*') ? 'active' : '' }}">
                <i class="bi bi-cpu"></i><span class="nav-link-text">AI Management</span>
            </a>
        </nav>

        <div class="sidebar-footer">
            <div class="d-flex align-items-center gap-2">
                <div class="admin-avatar">
                    {{ strtoupper(substr(auth('admin')->user()?->name ?? '?', 0, 1)) }}
                </div>
                <div class="overflow-hidden admin-meta">
                    <div class="admin-name text-truncate">{{ auth('admin')->user()?->name }}</div>
                    <div class="admin-role">{{ ucwords(str_replace('_', ' ', auth('admin')->user()?->role ?? '')) }}
                    </div>
                </div>
            </div>
        </div>
    </aside>

    {{-- ── Main ──────────────────────────────────────────── --}}
    <div class="admin-main">

        <header class="admin-topbar">
            <div class="topbar-left">
                <button class="sidebar-toggle" id="sidebarToggle" type="button" aria-label="Toggle sidebar">
                    <i class="bi bi-list" style="font-size:1.15rem"></i>
                </button>
                <div>
                    <h5 class="page-title">@yield('page-title', 'Admin Panel')</h5>
                    @hasSection('breadcrumb')
                        <nav aria-label="breadcrumb" class="mt-1">
                            <ol class="breadcrumb mb-0" style="font-size:.72rem">
                                <li class="breadcrumb-item"><a href="{{ route('admin.dashboard') }}"
                                        class="text-decoration-none" style="color:var(--text-muted)">Home</a></li>
                                @yield('breadcrumb')
                            </ol>
                        </nav>
                    @endif
                </div>
            </div>
            <div class="d-flex align-items-center gap-3">
                <span class="d-none d-md-inline" style="font-size:.78rem;color:var(--text-muted)">
                    <i class="bi bi-person-circle me-1"></i>{{ auth('admin')->user()?->email }}
                </span>
                <form action="{{ route('admin.logout') }}" method="POST" class="mb-0">
                    @csrf
                    <button class="btn btn-outline-secondary btn-sm" style="font-size:.78rem">
                        <i class="bi bi-box-arrow-right me-1"></i>Logout
                    </button>
                </form>
            </div>
        </header>

        <main class="admin-content">

            @if (session('status'))
                <div class="alert alert-success alert-dismissible fade show mb-4" role="alert">
                    <i class="bi bi-check-circle-fill me-2"></i>{{ session('status') }}
                    <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="alert"></button>
                </div>
            @endif

            @if (session('error'))
                <div class="alert alert-danger alert-dismissible fade show mb-4" role="alert">
                    <i class="bi bi-exclamation-triangle-fill me-2"></i>{{ session('error') }}
                    <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="alert"></button>
                </div>
            @endif

            @if ($errors->any())
                <div class="alert alert-danger alert-dismissible fade show mb-4" role="alert">
                    <i class="bi bi-exclamation-triangle-fill me-2"></i>
                    <ul class="mb-0 mt-1">
                        @foreach ($errors->all() as $error)
                            <li>{{ $error }}</li>
                        @endforeach
                    </ul>
                    <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="alert"></button>
                </div>
            @endif

            @yield('content')
        </main>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
        integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz" crossorigin="anonymous">
    </script>
    <script>
        (function() {
            const sidebar = document.getElementById('adminSidebar');
            const backdrop = document.getElementById('sidebarBackdrop');
            const toggle = document.getElementById('sidebarToggle');
            const collapseBtn = document.getElementById('sidebarCollapseBtn');
            const storageKey = 'admin-sidebar-collapsed';
            const isMobile = () => window.matchMedia('(max-width: 991.98px)').matches;

            function applyCollapsedState(collapsed) {
                document.body.classList.toggle('sidebar-collapsed', collapsed);
                if (collapseBtn) {
                    collapseBtn.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
                    collapseBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
                }
            }

            function openMobileSidebar() {
                sidebar.classList.add('show');
                backdrop.classList.add('show');
            }

            function closeMobileSidebar() {
                sidebar.classList.remove('show');
                backdrop.classList.remove('show');
            }

            if (!isMobile() && localStorage.getItem(storageKey) === '1') {
                applyCollapsedState(true);
            }

            if (toggle) {
                toggle.addEventListener('click', function() {
                    if (isMobile()) {
                        sidebar.classList.contains('show') ? closeMobileSidebar() : openMobileSidebar();
                        return;
                    }
                    const collapsed = !document.body.classList.contains('sidebar-collapsed');
                    applyCollapsedState(collapsed);
                    localStorage.setItem(storageKey, collapsed ? '1' : '0');
                });
            }

            if (collapseBtn) {
                collapseBtn.addEventListener('click', function() {
                    if (isMobile()) {
                        return;
                    }
                    const collapsed = !document.body.classList.contains('sidebar-collapsed');
                    applyCollapsedState(collapsed);
                    localStorage.setItem(storageKey, collapsed ? '1' : '0');
                });
            }

            if (backdrop) {
                backdrop.addEventListener('click', closeMobileSidebar);
            }

            window.addEventListener('resize', function() {
                if (!isMobile()) {
                    closeMobileSidebar();
                }
            });
        })();
    </script>
    @stack('scripts')
</body>

</html>
